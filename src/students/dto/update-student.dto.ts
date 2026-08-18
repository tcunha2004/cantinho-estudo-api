import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ContractStatus } from '../../student-contracts/enums/contract-status.enum';
import { UpdateGuardianDto } from './update-guardian.dto';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string | null;

  @IsOptional()
  @IsUUID()
  regionId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /* Ativa/cancela o contrato atual. Cancelar também cancela em cascata as
   * aulas agendadas desse contrato — ver StudentContractsService. */
  @IsOptional()
  @IsEnum(ContractStatus)
  contractStatus?: ContractStatus;

  /* Troca o plano do contrato atual. Não muta o contrato: cria um novo e
   * fecha o antigo, pra não reescrever cobrança/histórico já registrados. */
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @Matches(/^\d{1,3}(\.\d{1,2})?$/, {
    message: 'discountPercentage deve ser um número (ex.: 10 ou 10.50)',
  })
  discountPercentage?: string | null;

  /* Edita o responsável financeiro do aluno (ou o primeiro, se nenhum for
   * financeiro) — mesmo critério usado para exibição. */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateGuardianDto)
  guardian?: UpdateGuardianDto;
}
