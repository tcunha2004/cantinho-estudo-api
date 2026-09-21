import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlanEntity } from './entity/plan.entity';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanPricingDto } from '../regions/dto/plan-pricing.dto';
import { positiveMoney } from '../utils/money.util';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepository: Repository<PlanEntity>,
  ) {}

  /*
   * Reajuste dos valores de um plano. Campo ausente no corpo fica como está —
   * a tela manda só o que o admin mexeu.
   *
   * Não reescreve contratos nem parcelas já emitidas: `monthlyAmount` é
   * aplicado quando a parcela nasce (student-contracts.service.ts), então o
   * histórico mantém o valor da época. É o comportamento certo para reajuste
   * anual.
   */
  public async update(
    id: string,
    dto: UpdatePlanDto,
  ): Promise<PlanPricingDto> {
    const plan = await this.planRepository.findOne({ where: { id } });

    if (!plan) {
      throw new NotFoundException('Plano não encontrado');
    }

    if (dto.monthlyPrice !== undefined) {
      plan.monthlyPrice = positiveMoney(dto.monthlyPrice, 'monthlyPrice');
    }

    if (dto.hourPrice !== undefined) {
      plan.hourPrice = positiveMoney(dto.hourPrice, 'hourPrice');
    }

    if (dto.classesCount !== undefined) {
      plan.classesCount = dto.classesCount;
    }

    if (dto.validityMonths !== undefined) {
      plan.validityMonths = dto.validityMonths;
    }

    const saved = await this.planRepository.save(plan);

    return {
      id: saved.id,
      planType: saved.planType,
      frequency: saved.frequency,
      monthlyPrice: saved.monthlyPrice,
      hourPrice: saved.hourPrice,
      classesCount: saved.classesCount,
      validityMonths: saved.validityMonths,
    };
  }
}
