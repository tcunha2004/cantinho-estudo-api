import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { HashPasswordPipe } from './pipe/hash-password.pipe';
import { UsersController } from './users.controller';
import { NotFoundException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/decorator/roles.decorator';

function makeService() {
  const userRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const service = new UsersService(userRepository as never);
  return { service, userRepository };
}

describe('UsersService.findAll', () => {
  it('devolve id, nome, e-mail e papel — nunca a senha', async () => {
    const { service, userRepository } = makeService();
    userRepository.find.mockResolvedValue([
      {
        id: 'u1',
        name: 'Ana',
        email: 'ana@exemplo.com',
        role: 'admin',
        password: '$2b$10$hashquenaopodevazar',
      },
    ]);

    const result = await service.findAll();

    expect(result).toEqual([
      { id: 'u1', name: 'Ana', email: 'ana@exemplo.com', role: 'admin' },
    ]);
    expect(JSON.stringify(result)).not.toContain('$2b$');
  });

  it('ordena por nome', async () => {
    const { service, userRepository } = makeService();
    userRepository.find.mockResolvedValue([]);

    await service.findAll();

    expect(userRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { name: 'ASC' } }),
    );
  });
});

describe('senha definida pelo admin', () => {
  it('grava um hash que confere com a senha escolhida', async () => {
    const pipe = new HashPasswordPipe({ get: () => undefined } as never);
    const hash = await pipe.transform('segredo123');

    expect(hash).not.toBe('segredo123');
    expect(await bcrypt.compare('segredo123', hash)).toBe(true);
    expect(await bcrypt.compare('outra', hash)).toBe(false);
  });
});

function makeController() {
  const usersService = { findById: jest.fn(), updatePassword: jest.fn() };
  const hashPassword = {
    transform: jest.fn().mockResolvedValue('hash-de-segredo123'),
  };
  const controller = new UsersController(
    usersService as never,
    hashPassword as never,
  );
  return { controller, usersService, hashPassword };
}

describe('UsersController.setPassword', () => {
  it('grava o HASH no serviço, nunca a senha em claro', async () => {
    const { controller, usersService } = makeController();
    usersService.findById.mockResolvedValue({ id: 'u1' });

    await controller.setPassword('u1', { newPassword: 'segredo123' });

    expect(usersService.updatePassword).toHaveBeenCalledWith(
      'u1',
      'hash-de-segredo123',
    );
    expect(usersService.updatePassword).not.toHaveBeenCalledWith(
      'u1',
      'segredo123',
    );
  });

  it('usuário inexistente: 404 e updatePassword não é chamado', async () => {
    const { controller, usersService } = makeController();
    usersService.findById.mockResolvedValue(null);

    await expect(
      controller.setPassword('sumiu', { newPassword: 'segredo123' }),
    ).rejects.toThrow(NotFoundException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });
});

describe('UsersController — guards de autorização', () => {
  it('findAll e setPassword exigem o papel admin', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, UsersController.prototype.findAll),
    ).toEqual(['admin']);
    expect(
      Reflect.getMetadata(ROLES_KEY, UsersController.prototype.setPassword),
    ).toEqual(['admin']);
  });
});
