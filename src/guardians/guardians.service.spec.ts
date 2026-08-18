import { GuardiansService } from './guardians.service';

function makeService() {
  const guardianRepository = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
    find: jest.fn(),
    update: jest.fn(),
  };
  const service = new GuardiansService(guardianRepository as never);
  return { service, guardianRepository };
}

const guardian = {
  name: 'Marta Souza',
  phone: '31988887777',
  cpf: '111.222.333-44',
  isFinancialResponsible: true,
};

describe('GuardiansService', () => {
  it('amarra o responsável criado ao aluno', async () => {
    const { service, guardianRepository } = makeService();

    await service.create('s1', guardian as never);

    expect(guardianRepository.create).toHaveBeenCalledWith({
      ...guardian,
      student: { id: 's1' },
    });
  });

  it('cria vários responsáveis do mesmo aluno numa tacada', async () => {
    const { service, guardianRepository } = makeService();

    await service.createManyForStudent('s1', [
      guardian,
      { ...guardian, name: 'João Souza', isFinancialResponsible: false },
    ] as never);

    expect(guardianRepository.save).toHaveBeenCalledWith([
      { ...guardian, student: { id: 's1' } },
      {
        ...guardian,
        name: 'João Souza',
        isFinancialResponsible: false,
        student: { id: 's1' },
      },
    ]);
  });

  it('busca os responsáveis de um aluno', async () => {
    const { service, guardianRepository } = makeService();
    guardianRepository.find.mockResolvedValue([guardian]);

    await expect(service.findByStudent('s1')).resolves.toEqual([guardian]);
    expect(guardianRepository.find).toHaveBeenCalledWith({
      where: { student: { id: 's1' } },
    });
  });

  it('atualiza somente os campos enviados', async () => {
    const { service, guardianRepository } = makeService();

    await service.update('g1', { phone: '31900001111' });

    expect(guardianRepository.update).toHaveBeenCalledWith('g1', {
      phone: '31900001111',
    });
  });
});
