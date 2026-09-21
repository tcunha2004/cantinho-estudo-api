import {
  IsInt,
  IsNumberString,
  IsOptional,
  Min,
  ValidateIf,
} from 'class-validator';

/*
 * Reajuste de valores de um plano. `planType`, `frequency` e `region` ficam de
 * fora de propósito: são a identidade do plano (a constraint uq_plan é feita
 * deles), e o reajuste anual mexe só em preço e no que o pacote entrega.
 *
 * `classesCount` e `validityMonths` aceitam null — a avulsa não tem contagem de
 * aulas e só o Bronze tem validade.
 */
export class UpdatePlanDto {
  @IsOptional()
  @IsNumberString({}, { message: 'monthlyPrice deve ser um número' })
  monthlyPrice?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'hourPrice deve ser um número' })
  hourPrice?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: 'classesCount deve ser inteiro' })
  @Min(0, { message: 'classesCount não pode ser negativo' })
  classesCount?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: 'validityMonths deve ser inteiro' })
  @Min(0, { message: 'validityMonths não pode ser negativo' })
  validityMonths?: number | null;
}
