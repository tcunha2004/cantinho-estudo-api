import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentContractEntity } from './entity/student-contract.entity';
import { ContractStatus } from './enums/contract-status.enum';
import { PlanType } from '../plans/enums/plan-type.enum';
import { ClassEntity } from '../classes/entity/class.entity';
import { ClassStatus } from '../classes/enums/class-status.enum';
import { PaymentEntity } from '../payments/entity/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { todayNaive } from '../utils/date-range.util';

@Injectable()
export class StudentContractsService {
  constructor(
    @InjectRepository(StudentContractEntity)
    private readonly contractRepository: Repository<StudentContractEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
  ) {}

  /*
   * Muta o contrato existente — usado só pra ativar/cancelar. Cancelar não é
   * "trocar de plano", é encerrar o que já existe, então não há motivo pra
   * versionar aqui. Cancelar também cancela em cascata as aulas ainda
   * agendadas desse contrato (mesmo efeito do botão de cancelar aula
   * individual: sem cobrança, sem comissão) — sem isso, uma aula agendada sob
   * um contrato cancelado continuaria podendo ser encerrada e cobrada. Cancelar
   * também descarta qualquer troca de plano agendada: contrato encerrado não
   * troca de plano.
   */
  public async update(
    id: string,
    data: { status: ContractStatus },
  ): Promise<void> {
    await this.contractRepository.update(id, {
      status: data.status,
      ...(data.status === ContractStatus.CANCELLED
        ? { pendingPlan: null, pendingDiscountPercentage: null }
        : {}),
    });

    if (data.status === ContractStatus.CANCELLED) {
      await this.classRepository.update(
        { studentContract: { id }, status: ClassStatus.SCHEDULED },
        { status: ClassStatus.CANCELLED },
      );
    }
  }

  /* Existe parcela pending amarrada a este contrato? Usada tanto pra decidir
   * se uma troca de plano é imediata ou agendada, quanto pra bloquear
   * replace() de ser chamado enquanto ela existir. */
  public async hasOpenPayment(contractId: string): Promise<boolean> {
    const payment = await this.paymentRepository.findOne({
      where: {
        studentContract: { id: contractId },
        status: PaymentStatus.PENDING,
      },
    });

    return payment !== null;
  }

  /*
   * Bloqueia com parcela em aberto: a parcela fica amarrada ao contrato em que
   * foi gerada, e as aulas agendadas migram para o contrato novo — a parcela
   * antiga passaria a não achar nenhuma aula e mostraria R$ 0,00. Quem chama
   * com parcela em aberto deveria ter chamado schedulePlanChange() em vez
   * disso (é o que StudentsService.update() faz).
   *
   * Troca de plano/desconto não muta o contrato — cria um substituto e fecha
   * o antigo. Mutar reescreveria retroativamente a cobrança de aulas já
   * encerradas (finalize() lê plano/desconto do contrato) e o histórico de
   * pagamentos (findPaymentHistory() lê o plano do contrato ao vivo). As
   * aulas ainda agendadas do contrato antigo são reatribuídas para o novo
   * ANTES de fechar o antigo — nessa ordem, pra elas continuarem válidas e
   * cobrarem pelo plano/desconto vigente, em vez de serem canceladas pela
   * cascata do `update()` acima.
   */
  public async replace(
    oldContractId: string,
    data: { planId: string; discountPercentage: string | null },
  ): Promise<StudentContractEntity> {
    const old = await this.contractRepository.findOne({
      where: { id: oldContractId },
      relations: { student: true },
    });

    if (!old) {
      throw new NotFoundException('Contrato não encontrado');
    }

    if (await this.hasOpenPayment(oldContractId)) {
      throw new BadRequestException(
        'Não é possível trocar de plano com parcela em aberto. Pague a parcela pendente antes de trocar.',
      );
    }

    return await this.performReplace(old, data);
  }

  /*
   * Registra a troca de plano desejada sem mutar o contrato — ele continua
   * ACTIVE, com aulas e cobrança seguindo o plano atual normalmente.
   * Sobrescreve qualquer troca já agendada (o alvo mais recente vale).
   */
  public async schedulePlanChange(
    contractId: string,
    data: { planId: string; discountPercentage: string | null },
  ): Promise<void> {
    await this.contractRepository.update(contractId, {
      pendingPlan: { id: data.planId },
      pendingDiscountPercentage: data.discountPercentage,
    });
  }

  /* Desiste da troca agendada — o contrato permanece no plano atual. */
  public async clearPendingPlanChange(contractId: string): Promise<void> {
    await this.contractRepository.update(contractId, {
      pendingPlan: null,
      pendingDiscountPercentage: null,
    });
  }

  /*
   * Efetiva a troca agendada: chamado por StudentsService.updatePayment() no
   * instante em que a parcela que travava o contrato é marcada como paga —
   * não passa pelo guard de `replace()`, porque é exatamente essa parcela que
   * acabou de deixar de estar em aberto. Devolve null se não havia troca
   * agendada.
   */
  public async applyPendingPlanChange(
    contractId: string,
  ): Promise<StudentContractEntity | null> {
    const contract = await this.contractRepository.findOne({
      where: { id: contractId },
      relations: { student: true, pendingPlan: true },
    });

    if (!contract?.pendingPlan) {
      return null;
    }

    return await this.performReplace(contract, {
      planId: contract.pendingPlan.id,
      discountPercentage: contract.pendingDiscountPercentage,
    });
  }

  private async performReplace(
    old: StudentContractEntity,
    data: { planId: string; discountPercentage: string | null },
  ): Promise<StudentContractEntity> {
    const created = this.contractRepository.create({
      student: old.student,
      plan: { id: data.planId },
      discountPercentage: data.discountPercentage,
      startDate: todayNaive(),
      status: ContractStatus.ACTIVE,
    });

    const saved = await this.contractRepository.save(created);

    await this.classRepository.update(
      { studentContract: { id: old.id }, status: ClassStatus.SCHEDULED },
      { studentContract: { id: saved.id } },
    );

    await this.contractRepository.update(old.id, {
      status: ContractStatus.CANCELLED,
      endDate: todayNaive(),
      pendingPlan: null,
      pendingDiscountPercentage: null,
    });

    return saved;
  }

  /*
   * Planos ativos agrupados por tipo: conta os contratos com status active
   * pelo plan_type do plano. Retorna todos os tipos, inclusive os zerados.
   */
  public async countActiveByPlanType(): Promise<Record<PlanType, number>> {
    const rows = await this.contractRepository
      .createQueryBuilder('contract')
      .innerJoin('contract.plan', 'plan')
      .where('contract.status = :status', { status: ContractStatus.ACTIVE })
      .select('plan.plan_type', 'planType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('plan.plan_type')
      .getRawMany<{ planType: PlanType; count: string }>();

    const result = Object.values(PlanType).reduce(
      (acc, type) => ({ ...acc, [type]: 0 }),
      {} as Record<PlanType, number>,
    );

    for (const row of rows) {
      result[row.planType] = Number(row.count);
    }

    return result;
  }
}
