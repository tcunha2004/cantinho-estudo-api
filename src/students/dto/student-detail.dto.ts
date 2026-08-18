import { ContractStatus } from '../../student-contracts/enums/contract-status.enum';
import { Frequency } from '../../plans/enums/frequency.enum';
import { PlanType } from '../../plans/enums/plan-type.enum';

export class StudentDetailDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  /* Endereço para aulas em casa */
  address: string | null;
  active: boolean;
  region: { id: string; name: string };
  guardians: {
    name: string;
    phone: string;
    cpf: string;
    isFinancialResponsible: boolean;
  }[];
  /* Todos os contratos do aluno, mais recente primeiro */
  contracts: {
    id: string;
    planId: string;
    planType: PlanType;
    frequency: Frequency | null;
    status: ContractStatus;
    startDate: string;
    endDate: string | null;
    discountPercentage: string | null;
  }[];
}
