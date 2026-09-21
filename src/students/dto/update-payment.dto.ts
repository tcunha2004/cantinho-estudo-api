import { IsEnum, IsOptional, Matches } from 'class-validator';
import { PaymentStatus } from '../../payments/enums/payment-status.enum';

const DATE_FORMAT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/* Fechar/reabrir uma parcela pelo admin. `paidAt` é opcional: sem ele, marcar
 * como paga carimba o momento atual; com ele, registra o dia em que o aluno
 * pagou de fato. Só vale para o status "paga" — nos demais a data é limpa. */
export class UpdatePaymentDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @Matches(DATE_FORMAT, {
    message: 'paidAt deve estar no formato YYYY-MM-DD',
  })
  paidAt?: string;
}
