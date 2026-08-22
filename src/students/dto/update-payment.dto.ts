import { IsEnum } from 'class-validator';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';

/* Fechar/reabrir uma parcela pelo admin. `paidAt` não vem do corpo: é derivado
 * do status no serviço. */
export class UpdatePaymentDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;
}
