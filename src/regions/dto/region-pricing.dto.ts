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
