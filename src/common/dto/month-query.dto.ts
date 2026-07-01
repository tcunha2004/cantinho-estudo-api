import { Matches } from 'class-validator';

export class MonthQueryDto {
  /* Mês de referência no formato YYYY-MM (ex.: 2026-07) */
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'month deve estar no formato YYYY-MM',
  })
  month: string;
}
