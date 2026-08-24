import { PublicRegionPricingDto } from '../../regions/dto/region-pricing.dto';
import { SignupGuardian } from '../entity/signup-link.entity';

/*
 * O que a tela pública de cadastro precisa: o rascunho já preenchido (para
 * sobreviver a um refresh) e a tabela de regiões/planos, já que
 * `/regions/pricing` é só do admin. A senha nunca sai daqui.
 */
export class SignupFormDto {
  id: string;
  studentName: string | null;
  studentEmail: string | null;
  studentPhone: string | null;
  studentAddress: string | null;
  regionId: string | null;
  planId: string | null;
  guardians: SignupGuardian[] | null;
  /* Se o aluno já definiu uma senha — o campo em si nunca volta. */
  hasPassword: boolean;
  /* Sem `classCommission`: é o que a escola paga ao professor. */
  regions: PublicRegionPricingDto[];
}
