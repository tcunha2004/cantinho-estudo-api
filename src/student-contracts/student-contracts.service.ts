import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentContractEntity } from './entity/student-contract.entity';
import { ContractStatus } from './enums/contract-status.enum';
import { PlanType } from '../plans/enums/plan-type.enum';
import { ClassEntity } from '../classes/entity/class.entity';
import { ClassStatus } from '../classes/enums/class-status.enum';
import { todayNaive } from '../utils/date-range.util';

@Injectable()
export class StudentContractsService {
  constructor(
    @InjectRepository(StudentContractEntity)
    private readonly contractRepository: Repository<StudentContractEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
  ) {}

  /*
   * Muta o contrato existente — usado só pra ativar/cancelar. Cancelar não é
   * "trocar de plano", é encerrar o que já existe, então não há motivo pra
   * versionar aqui. Cancelar também cancela em cascata as aulas ainda
   * agendadas desse contrato (mesmo efeito do botão de cancelar aula
   * individual: sem cobrança, sem comissão) — sem isso, uma aula agendada sob
   * um contrato cancelado continuaria podendo ser encerrada e cobrada.
   */
  public async update(
    id: string,
    data: { status: ContractStatus },
  ): Promise<void> {
    await this.contractRepository.update(id, { status: data.status });

    if (data.status === ContractStatus.CANCELLED) {
      await this.classRepository.update(
        { studentContract: { id }, status: ClassStatus.SCHEDULED },
        { status: ClassStatus.CANCELLED },
      );
    }
  }

  /*
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

    const created = this.contractRepository.create({
      student: old.student,
      plan: { id: data.planId },
      discountPercentage: data.discountPercentage,
      startDate: todayNaive(),
      status: ContractStatus.ACTIVE,
    });

    const saved = await this.contractRepository.save(created);

    await this.classRepository.update(
      { studentContract: { id: oldContractId }, status: ClassStatus.SCHEDULED },
      { studentContract: { id: saved.id } },
    );

    await this.contractRepository.update(oldContractId, {
      status: ContractStatus.CANCELLED,
      endDate: todayNaive(),
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
