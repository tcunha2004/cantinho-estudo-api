import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateGuardianDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  cpf?: string;

  @IsOptional()
  @IsBoolean()
  isFinancialResponsible?: boolean;
}
