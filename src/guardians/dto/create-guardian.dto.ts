import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class CreateGuardianDto {
  @IsString({ message: 'Nome deve ser um texto' })
  @MinLength(3, { message: 'Nome deve ter pelo menos 3 caracteres' })
  @IsNotEmpty({ message: 'Nome não pode estar vazio' })
  name: string;

  @IsString({ message: 'Telefone deve ser um texto' })
  @IsNotEmpty({ message: 'Telefone não pode estar vazio' })
  phone: string;

  @IsString({ message: 'CPF deve ser um texto' })
  @Length(11, 14, { message: 'CPF inválido' })
  @IsNotEmpty({ message: 'CPF não pode estar vazio' })
  cpf: string;

  @IsOptional()
  @IsString({ message: 'RG deve ser um texto' })
  rg?: string;

  @IsOptional()
  @IsBoolean({ message: 'Responsável financeiro deve ser verdadeiro ou falso' })
  isFinancialResponsible?: boolean;
}
