import { IsEmail, IsIn, IsNotEmpty, IsOptional } from 'class-validator';
import type { SignupRole } from '../entity/signup-link.entity';

/*
 * O e-mail é a identidade do link: é a chave única de `users` e o único dado
 * que existe de alguém que ainda não existe. É por ele que gerar um link novo
 * revoga o anterior da mesma pessoa — ver SignupLinksService.create().
 */
export class CreateSignupLinkDto {
  @IsNotEmpty({ message: 'E-mail é obrigatório' })
  @IsEmail({}, { message: 'E-mail inválido' })
  studentEmail: string;

  /* Ausente é aluno: o fluxo do aluno veio primeiro e é o mais usado. */
  @IsOptional()
  @IsIn(['student', 'professor'], { message: 'Tipo de cadastro inválido' })
  role?: SignupRole;
}
