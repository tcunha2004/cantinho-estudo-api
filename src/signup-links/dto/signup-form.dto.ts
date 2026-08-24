import { PublicRegionPricingDto } from '../../regions/dto/region-pricing.dto';
import { SubjectDto } from '../../subjects/dto/subject.dto';
import { SignupGuardian, SignupRole } from '../entity/signup-link.entity';

/*
 * O que a tela pública de cadastro precisa: o rascunho já preenchido (para
 * sobreviver a um refresh) e as listas que ela não teria como buscar sozinha —
 * regiões/planos para o aluno, matérias para o professor, já que
 * `/regions/pricing` e `/subjects` são do admin. A senha nunca sai daqui.
 */
export class SignupFormDto {
  id: string;
  /* Aluno ou professor: é o que decide qual formulário a tela mostra. */
  role: SignupRole;
  studentName: string | null;
  studentEmail: string | null;
  studentPhone: string | null;
  studentAddress: string | null;
  regionId: string | null;
  planId: string | null;
  guardians: SignupGuardian[] | null;
  /* Apresentação do professor. */
  bio: string | null;
  /* Matérias que o professor já escolheu. */
  subjectIds: string[] | null;
  /* Se a pessoa já definiu uma senha — o campo em si nunca volta. */
  hasPassword: boolean;
  /* Aluno — sem `classCommission`: é o que a escola paga ao professor. */
  regions: PublicRegionPricingDto[];
  /* Professor — a lista mestra para ele escolher o que leciona. */
  subjects: SubjectDto[];
}
