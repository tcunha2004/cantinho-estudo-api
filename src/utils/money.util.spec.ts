import { BadRequestException } from '@nestjs/common';
import { positiveMoney } from './money.util';

describe('positiveMoney', () => {
  it('normaliza para duas casas decimais', () => {
    expect(positiveMoney('80.5', 'valor')).toBe('80.50');
    expect(positiveMoney('80', 'valor')).toBe('80.00');
  });

  it('recusa valor negativo', () => {
    expect(() => positiveMoney('-1', 'valor')).toThrow(BadRequestException);
  });

  it('recusa valor não numérico', () => {
    expect(() => positiveMoney('abc', 'valor')).toThrow(BadRequestException);
  });
});
