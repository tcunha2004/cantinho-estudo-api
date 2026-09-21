import { IsNumberString, IsOptional } from 'class-validator';

/*
 * Taxas da região, ajustadas no mesmo reajuste anual dos planos e exibidas na
 * mesma tela. Nome e slug ficam de fora: identificam a região, não são valor.
 */
export class UpdateRegionDto {
  @IsOptional()
  @IsNumberString({}, { message: 'enrollmentFee deve ser um número' })
  enrollmentFee?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'classCommission deve ser um número' })
  classCommission?: string;
}
