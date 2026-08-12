import { AgendaClassDto } from './agenda-class.dto';

/*
 * Aula completa, para o modal de detalhes. Os valores congelados só aparecem
 * para quem pode vê-los: comissão para o professor dono e para o admin, valor
 * cobrado só para o admin — nos demais casos vêm como null.
 */
export class ClassDetailDto extends AgendaClassDto {
  notes: string | null;
  region: string | null;
  commissionAmount: string | null;
  amountCharged: string | null;
  createdAt: string;
  updatedAt: string;
}
