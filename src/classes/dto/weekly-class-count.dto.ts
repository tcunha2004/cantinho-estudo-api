export class WeeklyClassCountDto {
  /* Número da semana dentro do mês (1 = dias 1–7, 2 = 8–14, ...) */
  week: number;

  /* Quantidade de aulas na semana; null quando não houve aulas */
  count: number | null;
}
