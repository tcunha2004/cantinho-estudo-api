import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegionEntity } from './entity/region.entity';
import { PlanType } from '../plans/enums/plan-type.enum';
import { RegionPricingDto } from './dto/region-pricing.dto';

/* Ordem de exibição da tabela de preços — do mais completo ao mais simples */
const PLAN_TYPE_ORDER: PlanType[] = [
  PlanType.OURO,
  PlanType.PRATA,
  PlanType.BRONZE,
  PlanType.AVULSA,
];

@Injectable()
export class RegionsService {
  constructor(
    @InjectRepository(RegionEntity)
    private readonly regionRepository: Repository<RegionEntity>,
  ) {}

  /* Tabela de preços vigente: regiões e os planos de cada uma, para a tela Informações. */
  public async findPricing(): Promise<RegionPricingDto[]> {
    const regions = await this.regionRepository.find({
      where: { active: true },
      relations: { plans: true },
      order: { createdAt: 'ASC' },
    });

    return regions.map((region) => ({
      id: region.id,
      name: region.name,
      slug: region.slug,
      enrollmentFee: region.enrollmentFee,
      classCommission: region.classCommission,
      plans: [...region.plans]
        .sort((a, b) => {
          const typeDiff =
            PLAN_TYPE_ORDER.indexOf(a.planType) -
            PLAN_TYPE_ORDER.indexOf(b.planType);
          return typeDiff !== 0
            ? typeDiff
            : (a.frequency ?? 0) - (b.frequency ?? 0);
        })
        .map((plan) => ({
          id: plan.id,
          planType: plan.planType,
          frequency: plan.frequency,
          monthlyPrice: plan.monthlyPrice,
          hourPrice: plan.hourPrice,
          classesCount: plan.classesCount,
          validityMonths: plan.validityMonths,
        })),
    }));
  }
}
