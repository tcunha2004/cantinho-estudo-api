import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

function makeService() {
  const userService = {
    findByEmailAndRole: jest.fn(),
    findById: jest.fn(),
    updatePassword: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('token.jwt.aqui'),
  };
  const hashPassword = {
    transform: jest.fn((password: string) => `hash(${password})`),
  };
  const service = new AuthService(
    userService as never,
    jwtService as never,
    hashPassword as never,
  );
  return { service, userService, jwtService, hashPassword };
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

    expect(JSON.stringify(jwtService.signAsync.mock.calls[0][0])).not.toContain(
      'teste123',
    );
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

const NEW_PASSWORD = 'senha-nova-123';

async function storedUser(password = 'teste123') {
  return {
    id: 'u1',
    name: 'Admin',
    email: 'admin@teste.com',
    role: 'admin',
    password: await bcrypt.hash(password, 10),
  };
}

describe('AuthService.changePassword', () => {
  it('grava o hash da nova senha quando a atual bate', async () => {
    const { service, userService, hashPassword } = makeService();
    userService.findById.mockResolvedValue(await storedUser());

    await service.changePassword('u1', {
      currentPassword: 'teste123',
      newPassword: NEW_PASSWORD,
    });

    expect(hashPassword.transform).toHaveBeenCalledWith(NEW_PASSWORD);
    expect(userService.updatePassword).toHaveBeenCalledWith(
      'u1',
      `hash(${NEW_PASSWORD})`,
    );
  });

  it('nunca grava a senha em texto claro', async () => {
    const { service, userService } = makeService();
    userService.findById.mockResolvedValue(await storedUser());

    await service.changePassword('u1', {
      currentPassword: 'teste123',
      newPassword: NEW_PASSWORD,
    });

    expect(userService.updatePassword).not.toHaveBeenCalledWith(
      'u1',
      NEW_PASSWORD,
    );
  });

  it('altera a senha do usuário do token, não outro qualquer', async () => {
    const { service, userService } = makeService();
    userService.findById.mockResolvedValue(await storedUser());

    await service.changePassword('u1', {
      currentPassword: 'teste123',
      newPassword: NEW_PASSWORD,
    });

    expect(userService.findById).toHaveBeenCalledWith('u1');
  });

  it('recusa senha atual errada sem tocar no banco', async () => {
    const { service, userService } = makeService();
    userService.findById.mockResolvedValue(await storedUser('outra-senha'));

    await expect(
      service.changePassword('u1', {
        currentPassword: 'teste123',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow('A senha atual está incorreta');
    expect(userService.updatePassword).not.toHaveBeenCalled();
  });

  /* 401 derrubaria a sessão no FE — errar a senha atual não é token inválido. */
  it('senha atual errada é 400, não 401', async () => {
    const { service, userService } = makeService();
    userService.findById.mockResolvedValue(await storedUser('outra-senha'));

    const error = await service
      .changePassword('u1', {
        currentPassword: 'teste123',
        newPassword: NEW_PASSWORD,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error).not.toBeInstanceOf(UnauthorizedException);
  });

  it('recusa usuário inexistente', async () => {
    const { service, userService } = makeService();
    userService.findById.mockResolvedValue(null);

    await expect(
      service.changePassword('u1', {
        currentPassword: 'teste123',
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(userService.updatePassword).not.toHaveBeenCalled();
  });

  it('recusa nova senha igual à atual', async () => {
    const { service, userService } = makeService();
    userService.findById.mockResolvedValue(await storedUser());

    await expect(
      service.changePassword('u1', {
        currentPassword: 'teste123',
        newPassword: 'teste123',
      }),
    ).rejects.toThrow('A nova senha deve ser diferente da atual');
    expect(userService.updatePassword).not.toHaveBeenCalled();
  });
});
