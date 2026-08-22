import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentContractEntity } from './entity/student-contract.entity';
import { ContractStatus } from './enums/contract-status.enum';
import { PlanEntity } from '../plans/entity/plan.entity';
import { PlanType } from '../plans/enums/plan-type.enum';
import { ClassEntity } from '../classes/entity/class.entity';
import { ClassStatus } from '../classes/enums/class-status.enum';
import { PaymentEntity } from '../payments/entity/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { addMonthsToDate, todayNaive } from '../utils/date-range.util';

/* Dia do vencimento das mensalidades — o mesmo usado pelos seeds. */
const DUE_DAY = 10;

/* Valor monetário como o banco guarda: decimal(10,2) em string. */
function money(value: number): string {
  return value.toFixed(2);
}

/*
 * Fim da vigência de um contrato que começa em startDate:
 *
 *   - Bronze é um pacote com validade em meses (validity_months);
 *   - Ouro e Prata vão até dezembro do ano em que começam — quem entra em maio
 *     paga de maio a dezembro, não 11 meses corridos;
 *   - avulsa não tem vigência.
 */
export function resolveContractEndDate(
  plan: PlanEntity,
  startDate: string,
): string | null {
  if (plan.validityMonths) {
    return addMonthsToDate(startDate, plan.validityMonths);
  }

  if (plan.planType === PlanType.AVULSA) {
    return null;
  }

  return `${startDate.slice(0, 4)}-12-31`;
}

/*
 * Mensalidade de um contrato: o preço do plano com o desconto aplicado. A aula
 * avulsa não tem mensalidade — a parcela dela é apurada pelas aulas do mês
 * (StudentsService.toPaymentDto), então nasce zerada.
 */
export function monthlyAmount(
  plan: PlanEntity,
  discountPercentage: string | null,
): string {
  if (plan.planType === PlanType.AVULSA) {
    return money(0);
  }

  return money(
    Number(plan.monthlyPrice) * (1 - Number(discountPercentage ?? 0) / 100),
  );
}

@Injectable()
export class StudentContractsService {
  constructor(
    @InjectRepository(StudentContractEntity)
    private readonly contractRepository: Repository<StudentContractEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepository: Repository<PlanEntity>,
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

  /*
   * Registra a troca de plano desejada sem mutar o contrato — ele continua
   * ACTIVE, com aulas e cobrança seguindo o plano atual normalmente. É sempre
   * assim: a troca só se efetiva quando o admin confirmar o pagamento da
   * mensalidade do mês, de modo que o mês da solicitação é cobrado pelo plano
   * antigo. Sobrescreve qualquer troca já agendada (o alvo mais recente vale).
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
   * instante em que a mensalidade do mês é marcada como paga. Devolve null se
   * não havia troca agendada.
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

  /*
   * Troca de plano/desconto não muta o contrato — cria um substituto e fecha o
   * antigo. Mutar reescreveria retroativamente o histórico de pagamentos
   * (o plano da parcela é lido do contrato ao vivo). As aulas ainda agendadas
   * do contrato antigo são reatribuídas para o novo ANTES de fechar o antigo —
   * nessa ordem, pra elas continuarem válidas em vez de serem canceladas pela
   * cascata do `update()` acima.
   */
  private async performReplace(
    old: StudentContractEntity,
    data: { planId: string; discountPercentage: string | null },
  ): Promise<StudentContractEntity> {
    const plan = await this.planRepository.findOne({
      where: { id: data.planId },
    });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    const startDate = todayNaive();

    const created = this.contractRepository.create({
      student: old.student,
      plan,
      discountPercentage: data.discountPercentage,
      startDate,
      endDate: resolveContractEndDate(plan, startDate),
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

    await this.createFirstPayment(saved, plan, startDate);

    return saved;
  }

  /*
   * Primeira parcela do contrato novo.
   *
   * A troca é disparada pelo pagamento da mensalidade do mês, que ficou no
   * contrato antigo — então o mês corrente já está cobrado, e o plano mensal
   * começa a pagar no mês seguinte. O Bronze é a exceção: parcela única, devida
   * na contratação. A avulsa também vence no mês corrente, porque é apurada
   * pelas aulas e as aulas agendadas acabaram de migrar para cá.
   *
   * Ouro e Prata caem no mesmo vencimento que StudentsService.createNextPayment
   * geraria logo em seguida; lá existe a checagem de duplicidade que resolve o
   * encontro.
   */
  private async createFirstPayment(
    contract: StudentContractEntity,
    plan: PlanEntity,
    startDate: string,
  ): Promise<void> {
    const isPackage = plan.planType === PlanType.BRONZE;
    const isPerClass = plan.planType === PlanType.AVULSA;

    const firstMonth =
      isPackage || isPerClass ? startDate : addMonthsToDate(startDate, 1);
    const dueDate = `${firstMonth.slice(0, 7)}-${String(DUE_DAY).padStart(2, '0')}`;

    if (contract.endDate && dueDate > contract.endDate) {
      return;
    }

    await this.paymentRepository.save(
      this.paymentRepository.create({
        studentContract: contract,
        amount: monthlyAmount(plan, contract.discountPercentage),
        dueDate,
        paidAt: null,
        status: PaymentStatus.PENDING,
      }),
    );
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
