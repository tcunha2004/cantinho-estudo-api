export class TeacherEarningsDto {
  id: string;
  name: string;
  /* Disciplinas do professor separadas por vírgula (vazio quando não há) */
  subject: string;
  /*
   * Aulas cobráveis do mês: as realizadas e as faltas sem aviso — nas duas o
   * professor recebe. O nome do campo é histórico; a tela mostra "Aulas no mês".
   */
  completedClasses: number;
  /* Total a receber no mês (soma das comissões das aulas cobráveis) */
  amountToReceive: number;
  /* Valor por aula no mês (0 quando não houve aulas cobráveis) */
  amountPerClass: number;
}
