import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';

/* DDD + celular, só números: 31999999999. */
const PHONE = /^\d{11}$/;

export class SignupGuardianDto {
  @IsString({ message: 'Nome do responsável deve ser um texto' })
  @MinLength(3, {
    message: 'Nome do responsável deve ter pelo menos 3 caracteres',
  })
  name: string;

  @IsString({ message: 'Telefone do responsável deve ser um texto' })
  @Matches(PHONE, {
    message: 'Telefone do responsável deve ter 11 dígitos, com DDD',
  })
  phone: string;

  @IsString({ message: 'CPF deve ser um texto' })
  @Length(11, 14, { message: 'CPF inválido' })
  cpf: string;

  @IsOptional()
  @IsString({ message: 'RG deve ser um texto' })
  rg?: string | null;

  @IsBoolean({ message: 'Responsável financeiro deve ser verdadeiro ou falso' })
  isFinancialResponsible: boolean;
}

/*
 * Salvamento de uma fase do formulário: tudo opcional, porque cada fase manda
 * só o que ela tem. A obrigatoriedade é cobrada no envio
 * (SignupLinksService.submit()), não aqui — e o que é obrigatório depende de o
 * rascunho ser de aluno ou de professor.
 */
export class UpdateSignupLinkDto {
  @IsOptional()
  @IsString({ message: 'Nome deve ser um texto' })
  @MinLength(3, { message: 'Nome deve ter pelo menos 3 caracteres' })
  studentName?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  studentEmail?: string;

  @IsOptional()
  @IsString({ message: 'Telefone deve ser um texto' })
  @Matches(PHONE, { message: 'Telefone deve ter 11 dígitos, com DDD' })
  studentPhone?: string;

  @IsOptional()
  @IsString({ message: 'Endereço deve ser um texto' })
  studentAddress?: string | null;

  /* Texto claro só em trânsito: vira hash no envio, nunca é gravado assim. */
  @IsOptional()
  @IsString({ message: 'Senha deve ser um texto' })
  @MinLength(6, { message: 'Senha deve ter pelo menos 6 caracteres' })
  password?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Região inválida' })
  regionId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Plano inválido' })
  planId?: string | null;

  /* Professor — apresentação dele, o mesmo texto de `teachers.bio`. */
  @IsOptional()
  @IsString({ message: 'Apresentação deve ser um texto' })
  bio?: string | null;

  /* Professor — matérias que ele leciona. */
  @IsOptional()
  @IsArray({ message: 'Matérias devem ser uma lista' })
  @ArrayMinSize(1, { message: 'Informe ao menos uma matéria' })
  @IsUUID('4', { each: true, message: 'Matéria inválida' })
  subjectIds?: string[];

  @IsOptional()
  @IsArray({ message: 'Responsáveis devem ser uma lista' })
  @ArrayMinSize(1, { message: 'Informe ao menos um responsável' })
  @ValidateNested({ each: true })
  @Type(() => SignupGuardianDto)
  guardians?: SignupGuardianDto[];
}
