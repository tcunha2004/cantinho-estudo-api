import { ThrottlerOptions } from '@nestjs/throttler';
import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/* Teto geral por IP — folgado o bastante para a navegação normal do app. */
export const DEFAULT_THROTTLE = { ttl: 60_000, limit: 120 };

/* Login: o que trava brute force em /auth/login. */
export const LOGIN_THROTTLE = { default: { ttl: 60_000, limit: 10 } };

/*
 * Salvamento de fase do cadastro: rota pública que roda bcrypt.hash a cada
 * chamada. O limite existe pelo custo de CPU, não pelo tráfego — o aluno
 * preenche quatro fases, não vinte por minuto.
 */
export const SIGNUP_DRAFT_THROTTLE = { default: { ttl: 60_000, limit: 20 } };

export function throttlerConfig(configService: ConfigService): {
  throttlers: ThrottlerOptions[];
  skipIf: (context: ExecutionContext) => boolean;
} {
  const disabled = configService.get<string>('THROTTLE_DISABLED') === 'true';

  return {
    throttlers: [DEFAULT_THROTTLE],
    /* As suítes e2e fazem dezenas de logins por minuto contra o mesmo IP. */
    skipIf: () => disabled,
  };
}
