import { IsOptional, IsString, Matches } from 'class-validator';

export class ApproveSignupDto {
  /*
   * Percentual de desconto do contrato — decimal em string, como o banco
   * guarda. Nulo (ou ausente) é sem desconto.
   */
  @IsOptional()
  @IsString({ message: 'Desconto deve ser um texto' })
  @Matches(/^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/, {
    message: 'Desconto deve ser um percentual entre 0 e 100',
  })
  discountPercentage?: string | null;
}
