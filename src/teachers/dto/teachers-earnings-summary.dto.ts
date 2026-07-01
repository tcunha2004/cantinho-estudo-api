import { TeacherEarningsDto } from './teacher-earnings.dto';

export class TeachersEarningsSummaryDto {
  /* Total de aulas concluídas no mês somando todos os professores */
  totalCompletedClasses: number;
  /* Valor total a ser pago a todos os professores no mês */
  totalAmountToReceive: string;
  /* Detalhamento por professor */
  teachers: TeacherEarningsDto[];
}
