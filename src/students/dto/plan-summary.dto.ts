import { Frequency } from '../../plans/enums/frequency.enum';
import { PlanType } from '../../plans/enums/plan-type.enum';

export class PlanSummaryDto {
  planType: PlanType;
  frequency: Frequency | null;
  monthlyPrice: string;
  hourPrice: string;
  /* Quantidade de aulas no mês */
  classesCount: number | null;
  /* Validade do pacote em meses */
  validityMonths: number | null;
}
