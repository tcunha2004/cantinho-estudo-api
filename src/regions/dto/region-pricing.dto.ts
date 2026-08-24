import { PlanPricingDto } from './plan-pricing.dto';

export class RegionPricingDto {
  id: string;
  name: string;
  slug: string;
  enrollmentFee: string;
  /* Comissão paga ao professor por hora de aula nesta região */
  classCommission: string;
  plans: PlanPricingDto[];
}

/*
 * A mesma tabela, menos a comissão: a tela pública de cadastro precisa de
 * preço e matrícula, mas não pode ver o que a escola paga ao professor.
 */
export type PublicRegionPricingDto = Omit<RegionPricingDto, 'classCommission'>;
