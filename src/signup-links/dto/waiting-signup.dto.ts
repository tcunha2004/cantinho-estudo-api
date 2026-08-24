import { Frequency } from '../../plans/enums/frequency.enum';
import { PlanType } from '../../plans/enums/plan-type.enum';
import { SignupGuardian } from '../entity/signup-link.entity';

/* Um cadastro aguardando aprovação, como o modal de notificações mostra. */
export class WaitingSignupDto {
  id: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  studentAddress: string | null;
  regionName: string;
  /* Taxa de matrícula da região — cobrada fora do sistema, aqui é informativa. */
  enrollmentFee: string;
  planId: string;
  planType: PlanType;
  frequency: Frequency | null;
  monthlyPrice: string;
  /* Preço real só na avulsa; nos planos mensais é referência. */
  hourPrice: string;
  classesCount: number | null;
  validityMonths: number | null;
  guardians: SignupGuardian[];
  submittedAt: string | null;
}
