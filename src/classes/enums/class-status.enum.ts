export enum ClassStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

/*
 * Aulas que geram dinheiro: a realizada e a falta sem aviso — nas duas o
 * professor esteve à disposição, então o aluno paga e o professor recebe.
 * Cancelamento não entra. É a fonte única de quem soma em receita e comissão.
 */
export const BILLABLE_STATUSES = [
  ClassStatus.COMPLETED,
  ClassStatus.NO_SHOW,
] as const;
