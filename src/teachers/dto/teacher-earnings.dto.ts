export class TeacherEarningsDto {
  id: string;
  name: string;
  /* Disciplinas do professor separadas por vírgula (vazio quando não há) */
  subject: string;
  /* Quantidade de aulas concluídas no mês */
  completedClasses: number;
  /* Total a receber no mês (soma das comissões das aulas concluídas) */
  amountToReceive: number;
  /* Valor por aula no mês (0 quando não houve aulas concluídas) */
  amountPerClass: number;
}
