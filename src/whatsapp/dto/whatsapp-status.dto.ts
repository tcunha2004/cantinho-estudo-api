export type WhatsappState =
  | 'not_configured'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'unreachable';

export interface WhatsappStatusDto {
  state: WhatsappState;
  /* Só em 'connecting'. */
  qrcode: string | null;
  /* Só em 'connected'. */
  phone: string | null;
  /* Só em 'connected'. */
  profileName: string | null;
}
