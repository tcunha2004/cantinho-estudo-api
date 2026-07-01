import { ContractStatus } from '../../student-contracts/enums/contract-status.enum';
import { Frequency } from '../../plans/enums/frequency.enum';
import { PlanType } from '../../plans/enums/plan-type.enum';

export class ActiveStudentDto {
  id: string;
  name: string;
  /* Responsável financeiro (ou o primeiro responsável, se não houver) */
  guardian: string | null;
  /* Dados referentes ao contrato mais recente do aluno */
  plan: PlanType | null;
  frequency: Frequency | null;
  monthlyPrice: string | null;
  contractStatus: ContractStatus | null;
}
