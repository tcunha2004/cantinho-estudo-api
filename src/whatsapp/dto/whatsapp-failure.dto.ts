import { WhatsappMessageStatus } from '../enums/whatsapp-message-status.enum';

export interface WhatsappFailureDto {
  id: string;
  studentName: string | null;
  phone: string;
  text: string;
  /* `pending` interrompida aparece como 'Envio interrompido'. */
  error: string;
  createdAt: string;
}

export interface WhatsappResendResultDto {
  id: string;
  status: WhatsappMessageStatus;
  error: string | null;
}
