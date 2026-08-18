import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenExpiredError } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/entity/user.entity';

/* ExecutionContext mínimo — só o que os guards leem de fato. */
function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const verifyAsync = jest.fn();
  const guard = new AuthGuard({ verifyAsync } as never);

  it('popula request.user com o payload do token', async () => {
    const payload = { sub: 'u1', role: 'admin' };
    verifyAsync.mockResolvedValue(payload);
    const request = { headers: { authorization: 'Bearer abc' } };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect((request as Record<string, unknown>).user).toBe(payload);
  });

  it('recusa requisição sem cabeçalho', async () => {
    await expect(
      guard.canActivate(makeContext({ headers: {} })),
    ).rejects.toThrow('Token de acesso não encontrado');
  });

  it('recusa esquema que não seja Bearer', async () => {
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('diferencia token expirado de token inválido', async () => {
    verifyAsync.mockRejectedValueOnce(new TokenExpiredError('jwt expired', new Date()));
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toThrow('Token expirado');

    verifyAsync.mockRejectedValueOnce(new Error('malformado'));
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer abc' } })),
    ).rejects.toThrow('Token inválido');
  });
});

describe('RolesGuard', () => {
  function makeGuard(allowed: UserRole[] | undefined) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(allowed),
    } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('libera o papel permitido', () => {
    expect(
      makeGuard(['admin']).canActivate(makeContext({ user: { role: 'admin' } })),
    ).toBe(true);
  });

  it('bloqueia papel fora da lista', () => {
    expect(() =>
      makeGuard(['admin']).canActivate(
        makeContext({ user: { role: 'professor' } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rota sem @Roles passa direto', () => {
    expect(
      makeGuard(undefined).canActivate(
        makeContext({ user: { role: 'student' } }),
      ),
    ).toBe(true);
  });

  it('lista vazia de papéis também passa direto', () => {
    expect(
      makeGuard([]).canActivate(makeContext({ user: { role: 'student' } })),
    ).toBe(true);
  });
});
