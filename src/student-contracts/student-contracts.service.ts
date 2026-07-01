import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentContractEntity } from './entity/student-contract.entity';
import { ContractStatus } from './enums/contract-status.enum';
import { PlanType } from '../plans/enums/plan-type.enum';

@Injectable()
export class StudentContractsService {
  constructor(
    @InjectRepository(StudentContractEntity)
    private readonly contractRepository: Repository<StudentContractEntity>,
  ) {}

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
