export class TeacherEarningsDto {
  id: string;
  name: string;
  /* Quantidade de aulas concluídas no mês */
  completedClasses: number;
  /* Total a receber no mês (soma das comissões das aulas concluídas) */
  amountToReceive: string;
}
