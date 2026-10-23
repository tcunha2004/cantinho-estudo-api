import { Frequency } from '../../plans/enums/frequency.enum';
import { PlanType } from '../../plans/enums/plan-type.enum';
import { SubjectDto } from '../../subjects/dto/subject.dto';
import { SignupGuardian } from '../entity/signup-link.entity';

/* O que todo cadastro aguardando tem, seja de aluno ou de professor. */
class WaitingSignupBaseDto {
  id: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  submittedAt: string | null;
}

export class WaitingStudentSignupDto extends WaitingSignupBaseDto {
  role: 'student';
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
}

export class WaitingTeacherSignupDto extends WaitingSignupBaseDto {
  role: 'professor';
  /* Apresentação escrita pelo próprio professor. */
  bio: string;
  subjects: SubjectDto[];
}

/*
 * Um cadastro aguardando aprovação, como o modal de notificações mostra. União
 * em vez de um objeto com metade dos campos nulos: `role` é o discriminante, e
 * quem lê é obrigado a ramificar antes de tocar no que é de um só dos dois.
 */
export type WaitingSignupDto =
  | WaitingStudentSignupDto
  | WaitingTeacherSignupDto;
