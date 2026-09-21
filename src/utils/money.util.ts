import { BadRequestException } from '@nestjs/common';

/* Decimal como o banco guarda: decimal(10,2) em string. '80.5' vira '80.50'.
 * Recusa valor negativo ou não numérico — é campo de dinheiro editável pelo
 * admin, e um valor inválido aqui contamina toda parcela gerada depois. */
export function positiveMoney(value: string, field: string): string {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new BadRequestException(`${field} deve ser um valor não negativo`);
  }

  return parsed.toFixed(2);
}
