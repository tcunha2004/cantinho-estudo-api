import { ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '../auth/auth.module';
import { throttlerConfig } from './throttler.config';

/*
 * As duas defesas que valem no boot, não em tempo de requisição: a chave que
 * assina todo token e o interruptor do rate limiting. Errar aqui não quebra
 * nada visível — só deixa o sistema aberto.
 */

function config(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('resolveJwtSecret', () => {
  it('aceita secret longo', () => {
    const secret = 'a'.repeat(32);
    expect(resolveJwtSecret(config({ JWT_SECRET: secret }))).toBe(secret);
  });

  it('recusa secret ausente', () => {
    expect(() => resolveJwtSecret(config({}))).toThrow('JWT_SECRET');
  });

  it('recusa secret curto', () => {
    expect(() =>
      resolveJwtSecret(config({ JWT_SECRET: 'a'.repeat(31) })),
    ).toThrow('mínimo 32 caracteres');
  });
});

describe('throttlerConfig', () => {
  it('limita por padrão', () => {
    const { skipIf } = throttlerConfig(config({}));

    expect(skipIf?.(null)).toBe(false);
  });

  /* O desligamento é explícito: qualquer outro valor mantém o limite de pé. */
  it('só desliga com a string exata', () => {
    expect(
      throttlerConfig(config({ THROTTLE_DISABLED: 'true' })).skipIf?.(null),
    ).toBe(true);
    expect(
      throttlerConfig(config({ THROTTLE_DISABLED: '1' })).skipIf?.(null),
    ).toBe(false);
  });
});
