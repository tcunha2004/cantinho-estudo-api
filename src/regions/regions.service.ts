import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegionEntity } from './entity/region.entity';
import { PlanType } from '../plans/enums/plan-type.enum';
import {
  PublicRegionPricingDto,
  RegionPricingDto,
} from './dto/region-pricing.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { positiveMoney } from '../utils/money.util';

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

  /*
   * A mesma tabela para a tela pública de cadastro, sem `classCommission` — o
   * aluno escolhe plano por preço, não precisa saber (nem pode) quanto a escola
   * paga ao professor. `/regions/pricing` é @Roles('admin') justamente por isso.
   */
  public async findPublicPricing(): Promise<PublicRegionPricingDto[]> {
    return (await this.findPricing()).map(
      ({ classCommission: _ignored, ...region }) => region,
    );
  }

  /*
   * Taxa de matrícula e comissão por aula da região. Campo ausente fica como
   * está. Reajustar a comissão não altera as aulas já encerradas: o valor da
   * comissão é congelado na aula quando ela é finalizada
   * (classes.service.ts), então o histórico de ganhos não se reescreve.
   */
  public async update(
    id: string,
    dto: UpdateRegionDto,
  ): Promise<RegionPricingDto> {
    const region = await this.regionRepository.findOne({
      where: { id },
      relations: { plans: true },
    });

    if (!region) {
      throw new NotFoundException('Região não encontrada');
    }

    if (dto.enrollmentFee !== undefined) {
      region.enrollmentFee = positiveMoney(dto.enrollmentFee, 'enrollmentFee');
    }

    if (dto.classCommission !== undefined) {
      region.classCommission = positiveMoney(
        dto.classCommission,
        'classCommission',
      );
    }

    const saved = await this.regionRepository.save(region);

    return {
      id: saved.id,
      name: saved.name,
      slug: saved.slug,
      enrollmentFee: saved.enrollmentFee,
      classCommission: saved.classCommission,
      plans: (saved.plans ?? []).map((plan) => ({
        id: plan.id,
        planType: plan.planType,
        frequency: plan.frequency,
        monthlyPrice: plan.monthlyPrice,
        hourPrice: plan.hourPrice,
        classesCount: plan.classesCount,
        validityMonths: plan.validityMonths,
      })),
    };
  }
}
