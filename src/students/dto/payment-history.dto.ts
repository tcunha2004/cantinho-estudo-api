import { PaymentStatus } from '../../payments/enums/payment-status.enum';
import { PlanType } from '../../plans/enums/plan-type.enum';

export class PaymentHistoryDto {
  id: string;
  /* Valor da parcela */
  amount: string;
  /* Vencimento da parcela */
  dueDate: string;
  /* Data do pagamento, nulo se ainda não pago */
  paidAt: string | null;
  status: PaymentStatus;
  /* Tipo do plano do contrato ao qual a parcela pertence */
  planType: PlanType;
}
