import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

function makeService() {
  const userService = { findByEmailAndRole: jest.fn() };
  const jwtService = { signAsync: jest.fn().mockResolvedValue('token.jwt.aqui') };
  const service = new AuthService(userService as never, jwtService as never);
  return { service, userService, jwtService };
}

const credentials = {
  email: 'admin@teste.com',
  password: 'teste123',
  role: 'admin' as const,
};

describe('AuthService.login', () => {
  it('devolve o token quando e-mail, senha e papel batem', async () => {
    const { service, userService, jwtService } = makeService();
    userService.findByEmailAndRole.mockResolvedValue({
      id: 'u1',
      name: 'Admin',
      email: 'admin@teste.com',
      role: 'admin',
      password: await bcrypt.hash('teste123', 10),
    });

    await expect(service.login(credentials)).resolves.toEqual({
      access_token: 'token.jwt.aqui',
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'u1',
      name: 'Admin',
      email: 'admin@teste.com',
      role: 'admin',
    });
  });

  it('não coloca a senha no payload do token', async () => {
    const { service, userService, jwtService } = makeService();
    userService.findByEmailAndRole.mockResolvedValue({
      id: 'u1',
      name: 'Admin',
      email: 'admin@teste.com',
      role: 'admin',
      password: await bcrypt.hash('teste123', 10),
    });

    await service.login(credentials);

    expect(
      JSON.stringify(jwtService.signAsync.mock.calls[0][0]),
    ).not.toContain('teste123');
  });

  it('recusa senha errada', async () => {
    const { service, userService } = makeService();
    userService.findByEmailAndRole.mockResolvedValue({
      id: 'u1',
      name: 'Admin',
      email: 'admin@teste.com',
      role: 'admin',
      password: await bcrypt.hash('outra-senha', 10),
    });

    await expect(service.login(credentials)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa e-mail inexistente sem revelar que não existe', async () => {
    const { service, userService } = makeService();
    userService.findByEmailAndRole.mockResolvedValue(null);

    await expect(service.login(credentials)).rejects.toThrow(
      'O e-mail ou a senha está incorreto',
    );
  });

  it('procura o usuário pelo par e-mail + papel', async () => {
    const { service, userService } = makeService();
    userService.findByEmailAndRole.mockResolvedValue(null);

    await expect(
      service.login({ ...credentials, role: 'student' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(userService.findByEmailAndRole).toHaveBeenCalledWith(
      'admin@teste.com',
      'student',
    );
  });
});
