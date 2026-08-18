import { NotFoundException } from '@nestjs/common';
import { TeachersService } from './teachers.service';

/* Query builder encadeável cujo getRawMany devolve as linhas dadas. */
function fakeQueryBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = { calls: [] as string[] };
  for (const method of [
    'where',
    'andWhere',
    'select',
    'addSelect',
    'groupBy',
    'addGroupBy',
    'orderBy',
    'innerJoin',
    'leftJoin',
  ]) {
    builder[method] = (...args: unknown[]) => {
      (builder.calls as string[]).push(String(args[0]));
      return builder;
    };
  }
  builder.getRawMany = () => Promise.resolve(rows);
  return builder;
}

function makeService() {
  const teacherRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const userRepository = { update: jest.fn() };
  const subjectRepository = { find: jest.fn() };

  const service = new TeachersService(
    teacherRepository as never,
    userRepository as never,
    subjectRepository as never,
  );

  return { service, teacherRepository, userRepository, subjectRepository };
}

function makeTeacher(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    bio: 'Licenciada em Matemática',
    active: true,
    user: { id: 'u1', name: 'Renata Lima', email: 'renata@teste.com' },
    subjects: [{ id: 'sub1', name: 'Matemática' }],
    ...over,
  } as never;
}

describe('TeachersService', () => {
  describe('findById', () => {
    it('lança 404 quando o professor não existe', async () => {
      const { service, teacherRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    });

    it('devolve dados cadastrais e matérias', async () => {
      const { service, teacherRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());

      await expect(service.findById('t1')).resolves.toEqual({
        id: 't1',
        name: 'Renata Lima',
        email: 'renata@teste.com',
        bio: 'Licenciada em Matemática',
        active: true,
        subjects: [{ id: 'sub1', name: 'Matemática' }],
      });
    });
  });

  describe('update', () => {
    it('lança 404 quando o professor não existe', async () => {
      const { service, teacherRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(null);

      await expect(service.update('x', { bio: 'nova' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('nome e email vão para o usuário', async () => {
      const { service, teacherRepository, userRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());

      await service.update('t1', { name: 'Renata L.' });

      expect(userRepository.update).toHaveBeenCalledWith('u1', {
        name: 'Renata L.',
      });
      expect(teacherRepository.update).not.toHaveBeenCalled();
    });

    it('bio e inativação vão para o professor', async () => {
      const { service, teacherRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());

      await service.update('t1', { bio: null, active: false });

      expect(teacherRepository.update).toHaveBeenCalledWith('t1', {
        bio: null,
        active: false,
      });
    });

    it('substitui a lista de matérias quando subjectIds vem no dto', async () => {
      const { service, teacherRepository, subjectRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      subjectRepository.find.mockResolvedValue([
        { id: 'sub2', name: 'Física' },
        { id: 'sub3', name: 'Química' },
      ]);

      await service.update('t1', { subjectIds: ['sub2', 'sub3'] });

      expect(subjectRepository.find).toHaveBeenCalled();
      /*
       * Só id + matérias: salvar a entidade carregada no início do método
       * devolveria bio/active aos valores de antes do update.
       */
      expect(teacherRepository.save).toHaveBeenCalledWith({
        id: 't1',
        subjects: [
          { id: 'sub2', name: 'Física' },
          { id: 'sub3', name: 'Química' },
        ],
      });
    });

    it('lista vazia de matérias apaga todas as matérias', async () => {
      const { service, teacherRepository, subjectRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      subjectRepository.find.mockResolvedValue([]);

      await service.update('t1', { subjectIds: [] });

      expect(teacherRepository.save).toHaveBeenCalledWith({
        id: 't1',
        subjects: [],
      });
    });

    it('bio e matérias no mesmo dto: a bio não é desfeita pelo save das matérias', async () => {
      const { service, teacherRepository, subjectRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      subjectRepository.find.mockResolvedValue([{ id: 'sub2', name: 'Física' }]);

      await service.update('t1', { bio: 'Bio nova', subjectIds: ['sub2'] });

      expect(teacherRepository.update).toHaveBeenCalledWith('t1', {
        bio: 'Bio nova',
      });
      /* O save das matérias não pode carregar coluna nenhuma da entidade antiga. */
      const salvo = teacherRepository.save.mock.calls[0][0] as Record<string, unknown>;
      expect(Object.keys(salvo).sort()).toEqual(['id', 'subjects']);
    });

    it('não toca em nada quando o dto vem vazio', async () => {
      const { service, teacherRepository, userRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());

      await service.update('t1', {});

      expect(userRepository.update).not.toHaveBeenCalled();
      expect(teacherRepository.update).not.toHaveBeenCalled();
      expect(teacherRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getAllTeachersEarningsByMonth', () => {
    it('soma as comissões e as aulas de cada professor e o total geral', async () => {
      const { service, teacherRepository } = makeService();
      teacherRepository.createQueryBuilder.mockReturnValue(
        fakeQueryBuilder([
          {
            id: 't1',
            name: 'Ana Paula',
            subject: 'Física, Química',
            completedClasses: '8',
            amountToReceive: '320.00',
          },
          {
            id: 't2',
            name: 'Renata Lima',
            subject: null,
            completedClasses: '0',
            amountToReceive: '0',
          },
        ]),
      );

      const summary = await service.getAllTeachersEarningsByMonth('2026-08');

      expect(summary.totalCompletedClasses).toBe(8);
      expect(summary.totalAmountToReceive).toBe(320);
      expect(summary.teachers[0]).toEqual({
        id: 't1',
        name: 'Ana Paula',
        subject: 'Física, Química',
        completedClasses: 8,
        amountToReceive: 320,
      });
      /* Professor sem aula aparece zerado, não desaparece. */
      expect(summary.teachers[1]).toMatchObject({
        subject: '',
        completedClasses: 0,
        amountToReceive: 0,
      });
    });

    it('considera apenas professores ativos', async () => {
      const { service, teacherRepository } = makeService();
      const builder = fakeQueryBuilder([]);
      teacherRepository.createQueryBuilder.mockReturnValue(builder);

      await service.getAllTeachersEarningsByMonth('2026-08');

      expect(builder.calls).toContain('teacher.active = true');
    });

    it('filtra pelo mês pedido, não pelo mês corrente', async () => {
      const { service, teacherRepository } = makeService();
      const builder = fakeQueryBuilder([]);
      teacherRepository.createQueryBuilder.mockReturnValue(builder);

      await service.getAllTeachersEarningsByMonth('2026-02');

      /* O join carrega o intervalo do mês — fevereiro de 2026 tem 28 dias. */
      const joinCall = (builder.calls as string[]).find((call) =>
        call.includes('teacher.classes'),
      );
      expect(joinCall).toBe('teacher.classes');
    });

    it('devolve totais zerados quando não há professor', async () => {
      const { service, teacherRepository } = makeService();
      teacherRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder([]));

      await expect(
        service.getAllTeachersEarningsByMonth('2026-08'),
      ).resolves.toEqual({
        totalCompletedClasses: 0,
        totalAmountToReceive: 0,
        teachers: [],
      });
    });
  });
});
