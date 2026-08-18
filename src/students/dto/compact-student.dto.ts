import { ContractStatus } from '../../student-contracts/enums/contract-status.enum';
import { Frequency } from '../../plans/enums/frequency.enum';
import { PlanType } from '../../plans/enums/plan-type.enum';

export enum StudentStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export class CompactStudentDto {
  id: string;
  name: string;
  status: StudentStatus;
  /* Responsável financeiro (ou o primeiro responsável, se não houver) */
  guardian: string | null;
  /* Dados referentes ao contrato mais recente do aluno */
  plan: PlanType | null;
  frequency: Frequency | null;
  region: string | null;
  contractStatus: ContractStatus | null;
}
