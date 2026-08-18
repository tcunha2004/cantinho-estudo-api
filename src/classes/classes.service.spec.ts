import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { ClassStatus } from './enums/class-status.enum';
import { LocationType } from './enums/location-type.enum';
import { ContractStatus } from '../student-contracts/enums/contract-status.enum';
import { PlanType } from '../plans/enums/plan-type.enum';
import { Frequency } from '../plans/enums/frequency.enum';
import { UserPayload } from '../auth/auth.service';

/*
 * Regras de agendamento e o congelamento do dinheiro no encerramento da aula.
 * Repositório mockado: o SQL de conflito e de soma está coberto em
 * test/api.e2e-spec.ts, contra o banco de verdade.
 */

const admin: UserPayload = {
  sub: 'user-admin',
  name: 'Admin',
  email: 'admin@teste.com',
  role: 'admin',
};
const professor: UserPayload = {
  sub: 'user-prof',
  name: 'Renata',
  email: 'prof@teste.com',
  role: 'professor',
};
const aluno: UserPayload = {
  sub: 'user-aluno',
  name: 'João',
  email: 'aluno@teste.com',
  role: 'student',
};

const cantinho = {
  id: 'r-cantinho',
  name: 'Cantinho',
  slug: 'cantinho',
  classCommission: '25.00',
};
const vila = {
  id: 'r-vila',
  name: 'Vila da Serra',
  slug: 'vila-da-serra',
  classCommission: '35.00',
};

/* Query builder encadeável: guarda as chamadas e devolve o resultado dado. */
function fakeQueryBuilder(result: unknown) {
  const builder: Record<string, unknown> = { params: {} as Record<string, unknown> };
  for (const method of [
    'where',
    'andWhere',
    'select',
    'addSelect',
    'groupBy',
    'orderBy',
    'innerJoin',
    'leftJoin',
  ]) {
    builder[method] = (_clause: unknown, params?: Record<string, unknown>) => {
      Object.assign(builder.params as object, params ?? {});
      return builder;
    };
  }
  builder.getRawOne = () => Promise.resolve(result);
  builder.getRawMany = () => Promise.resolve(result);
  builder.getExists = () => Promise.resolve(result);
  return builder;
}

function makeService() {
  const classRepository = {
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
    update: jest.fn(),
    create: jest.fn((data: unknown) => data),
    createQueryBuilder: jest.fn(() => fakeQueryBuilder(false)),
  };
  const contractRepository = { findOne: jest.fn(), find: jest.fn() };
  const teacherRepository = { findOne: jest.fn(), find: jest.fn() };
  const planRepository = { findOne: jest.fn() };
  const regionRepository = { findOne: jest.fn() };

  const service = new ClassesService(
    classRepository as never,
    contractRepository as never,
    teacherRepository as never,
    planRepository as never,
    regionRepository as never,
  );

  return {
    service,
    classRepository,
    contractRepository,
    teacherRepository,
    planRepository,
    regionRepository,
  };
}

function makeTeacher(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    active: true,
    user: { id: 'user-prof', name: 'Renata Lima' },
    subjects: [{ id: 'sub1', name: 'Matemática' }],
    ...over,
  } as never;
}

function makeContract(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    status: ContractStatus.ACTIVE,
    startDate: '2026-01-01',
    discountPercentage: null,
    plan: {
      id: 'p1',
      planType: PlanType.OURO,
      frequency: Frequency.THREE_TIMES_WEEK,
      hourPrice: '60.00',
    },
    student: {
      id: 's1',
      active: true,
      region: cantinho,
      user: { id: 'user-aluno', name: 'João Silva' },
    },
    ...over,
  } as never;
}

function makeClass(over: Record<string, unknown> = {}) {
  return {
    id: 'cl1',
    scheduledAt: '2026-08-10T14:00:00',
    durationMinutes: 60,
    status: ClassStatus.SCHEDULED,
    locationType: LocationType.SCHOOL,
    notes: null,
    region: null,
    commissionAmount: null,
    amountCharged: null,
    createdAt: '2026-08-01T10:00:00',
    updatedAt: '2026-08-01T10:00:00',
    subject: { id: 'sub1', name: 'Matemática' },
    teacher: makeTeacher(),
    studentContract: makeContract(),
    ...over,
  } as never;
}

describe('ClassesService', () => {
  afterEach(() => jest.useRealTimers());

  describe('agenda', () => {
    it('aluno vê apenas as próprias aulas', async () => {
      const { service, classRepository } = makeService();
      classRepository.find.mockResolvedValue([]);

      await service.findAgenda(aluno, { from: '2026-08-10', to: '2026-08-16' });

      expect(classRepository.find.mock.calls[0][0].where).toMatchObject({
        studentContract: { student: { user: { id: 'user-aluno' } } },
      });
    });

    it('professor vê apenas as aulas que dá', async () => {
      const { service, classRepository } = makeService();
      classRepository.find.mockResolvedValue([]);

      await service.findAgenda(professor, {
        from: '2026-08-10',
        to: '2026-08-16',
      });

      expect(classRepository.find.mock.calls[0][0].where).toMatchObject({
        teacher: { user: { id: 'user-prof' } },
      });
    });

    it('professor não consegue espiar outro professor pelo filtro', async () => {
      const { service, classRepository } = makeService();
      classRepository.find.mockResolvedValue([]);

      await service.findAgenda(professor, {
        from: '2026-08-10',
        to: '2026-08-16',
        teacherId: 'outro-professor',
      });

      expect(classRepository.find.mock.calls[0][0].where).toMatchObject({
        teacher: { user: { id: 'user-prof' } },
      });
    });

    it('admin pode filtrar por professor, aluno e status', async () => {
      const { service, classRepository } = makeService();
      classRepository.find.mockResolvedValue([]);

      await service.findAgenda(admin, {
        from: '2026-08-10',
        to: '2026-08-16',
        teacherId: 't9',
        studentId: 's9',
        status: ClassStatus.COMPLETED,
      });

      expect(classRepository.find.mock.calls[0][0].where).toMatchObject({
        teacher: { id: 't9' },
        studentContract: { student: { id: 's9' } },
        status: ClassStatus.COMPLETED,
      });
    });

    it('recusa intervalo invertido', async () => {
      const { service } = makeService();

      await expect(
        service.findAgenda(admin, { from: '2026-08-16', to: '2026-08-10' }),
      ).rejects.toThrow('O fim do intervalo é anterior ao início');
    });

    it('recusa intervalo maior que 62 dias', async () => {
      const { service } = makeService();

      await expect(
        service.findAgenda(admin, { from: '2026-01-01', to: '2026-06-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('aceita o intervalo de um dia só', async () => {
      const { service, classRepository } = makeService();
      classRepository.find.mockResolvedValue([]);

      await expect(
        service.findAgenda(admin, { from: '2026-08-10', to: '2026-08-10' }),
      ).resolves.toEqual([]);
    });

    it('calcula o fim da aula a partir da duração', async () => {
      const { service, classRepository } = makeService();
      classRepository.find.mockResolvedValue([
        makeClass({ scheduledAt: '2026-08-10T14:00:00', durationMinutes: 90 }),
      ]);

      const [item] = await service.findAgenda(admin, {
        from: '2026-08-10',
        to: '2026-08-10',
      });

      expect(item.scheduledAt).toBe('2026-08-10T14:00:00');
      expect(item.endsAt).toBe('2026-08-10T15:30:00');
      expect(item.student.name).toBe('João Silva');
      expect(item.teacher.name).toBe('Renata Lima');
    });
  });

  describe('findFormOptions', () => {
    it('professor recebe só as próprias matérias e nenhum professor para escolher', async () => {
      const { service, teacherRepository, contractRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      contractRepository.find.mockResolvedValue([makeContract()]);

      const options = await service.findFormOptions(professor);

      expect(options.teachers).toEqual([]);
      expect(options.subjects).toEqual([{ id: 'sub1', name: 'Matemática' }]);
      expect(options.students).toEqual([{ id: 's1', name: 'João Silva' }]);
    });

    it('admin recebe os professores com as matérias de cada um', async () => {
      const { service, teacherRepository, contractRepository } = makeService();
      teacherRepository.find.mockResolvedValue([
        makeTeacher({ id: 't2', user: { id: 'u2', name: 'Zeca' } }),
        makeTeacher(),
      ]);
      contractRepository.find.mockResolvedValue([makeContract()]);

      const options = await service.findFormOptions(admin);

      expect(options.teachers.map((teacher) => teacher.name)).toEqual([
        'Renata Lima',
        'Zeca',
      ]);
      expect(options.teachers[0].subjects).toEqual([
        { id: 'sub1', name: 'Matemática' },
      ]);
      expect(options.subjects).toEqual([]);
    });

    it('aluno com dois contratos ativos aparece uma vez só', async () => {
      const { service, teacherRepository, contractRepository } = makeService();
      teacherRepository.find.mockResolvedValue([]);
      contractRepository.find.mockResolvedValue([
        makeContract(),
        makeContract({ id: 'c2' }),
      ]);

      const options = await service.findFormOptions(admin);

      expect(options.students).toEqual([{ id: 's1', name: 'João Silva' }]);
    });
  });

  describe('create', () => {
    it('admin precisa informar o professor', async () => {
      const { service } = makeService();

      await expect(
        service.create(admin, {
          studentId: 's1',
          subjectId: 'sub1',
          scheduledAt: '2026-08-10T14:00',
          locationType: LocationType.SCHOOL,
        }),
      ).rejects.toThrow('Informe o professor da aula');
    });

    it('professor não agenda para outro professor', async () => {
      const { service, teacherRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());

      await expect(
        service.create(professor, {
          studentId: 's1',
          teacherId: 'outro',
          subjectId: 'sub1',
          scheduledAt: '2026-08-10T14:00',
          locationType: LocationType.SCHOOL,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('recusa matéria que o professor não leciona', async () => {
      const { service, teacherRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());

      await expect(
        service.create(admin, {
          studentId: 's1',
          teacherId: 't1',
          subjectId: 'sub-outra',
          scheduledAt: '2026-08-10T14:00',
          locationType: LocationType.SCHOOL,
        }),
      ).rejects.toThrow('O professor não leciona essa matéria');
    });

    it('recusa aluno sem contrato ativo', async () => {
      const { service, teacherRepository, contractRepository } = makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      contractRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(admin, {
          studentId: 's1',
          teacherId: 't1',
          subjectId: 'sub1',
          scheduledAt: '2026-08-10T14:00',
          locationType: LocationType.SCHOOL,
        }),
      ).rejects.toThrow('não possui um contrato ativo');
    });

    it('recusa quando o professor já tem aula no horário', async () => {
      const { service, teacherRepository, contractRepository, classRepository } =
        makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      contractRepository.findOne.mockResolvedValue(makeContract());
      classRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(true));

      await expect(
        service.create(admin, {
          studentId: 's1',
          teacherId: 't1',
          subjectId: 'sub1',
          scheduledAt: '2026-08-10T14:00',
          locationType: LocationType.SCHOOL,
        }),
      ).rejects.toThrow('O professor já tem uma aula nesse horário');
    });

    it('recusa quando o aluno já tem aula no horário', async () => {
      const { service, teacherRepository, contractRepository, classRepository } =
        makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      contractRepository.findOne.mockResolvedValue(makeContract());
      /* Primeiro check (professor) livre, segundo (aluno) ocupado. */
      classRepository.createQueryBuilder
        .mockReturnValueOnce(fakeQueryBuilder(false))
        .mockReturnValueOnce(fakeQueryBuilder(true));

      await expect(
        service.create(admin, {
          studentId: 's1',
          teacherId: 't1',
          subjectId: 'sub1',
          scheduledAt: '2026-08-10T14:00',
          locationType: LocationType.SCHOOL,
        }),
      ).rejects.toThrow('O aluno já tem uma aula nesse horário');
    });

    it('cria agendada, com 60 minutos por padrão e sem valores congelados', async () => {
      const { service, teacherRepository, contractRepository, classRepository } =
        makeService();
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      contractRepository.findOne.mockResolvedValue(makeContract());
      classRepository.save.mockResolvedValue({ id: 'nova' });
      classRepository.findOne.mockResolvedValue(makeClass({ id: 'nova' }));

      await service.create(admin, {
        studentId: 's1',
        teacherId: 't1',
        subjectId: 'sub1',
        scheduledAt: '2026-08-10T14:00',
        locationType: LocationType.SCHOOL,
        notes: '   ',
      });

      expect(classRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMinutes: 60,
          status: ClassStatus.SCHEDULED,
          scheduledAt: '2026-08-10T14:00:00',
          region: null,
          commissionAmount: null,
          amountCharged: null,
          /* Observação só de espaços não vira string vazia no banco. */
          notes: null,
        }),
      );
    });
  });

  describe('update', () => {
    it('professor não pode repassar a aula para outro', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(makeClass());

      await expect(
        service.update(professor, 'cl1', { teacherId: 't2' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('aula encerrada só aceita mudança na observação', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({ status: ClassStatus.COMPLETED }),
      );

      await expect(
        service.update(admin, 'cl1', { durationMinutes: 90 }),
      ).rejects.toThrow('Aulas encerradas só permitem editar as observações');
    });

    it('aula encerrada aceita editar a observação', async () => {
      const { service, classRepository, teacherRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({ status: ClassStatus.COMPLETED }),
      );
      teacherRepository.findOne.mockResolvedValue(makeTeacher());

      await service.update(admin, 'cl1', { notes: 'Aluno chegou atrasado' });

      expect(classRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ notes: 'Aluno chegou atrasado' }),
      );
    });

    it('observação vazia apaga a observação; campo ausente mantém', async () => {
      const { service, classRepository, teacherRepository } = makeService();
      classRepository.findOne.mockResolvedValue(makeClass({ notes: 'antiga' }));
      teacherRepository.findOne.mockResolvedValue(makeTeacher());

      await service.update(admin, 'cl1', { notes: '' });
      expect(classRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ notes: null }),
      );

      await service.update(admin, 'cl1', {});
      expect(classRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ notes: 'antiga' }),
      );
    });

    it('ignora a própria aula ao checar conflito de horário', async () => {
      const { service, classRepository, teacherRepository } = makeService();
      classRepository.findOne.mockResolvedValue(makeClass());
      teacherRepository.findOne.mockResolvedValue(makeTeacher());
      const builder = fakeQueryBuilder(false);
      classRepository.createQueryBuilder.mockReturnValue(builder);

      await service.update(admin, 'cl1', { scheduledAt: '2026-08-10T16:00' });

      expect((builder.params as Record<string, unknown>).exceptClassId).toBe(
        'cl1',
      );
    });
  });

  describe('cancelar, encerrar e reabrir', () => {
    it('cancela sem cobrar nem pagar comissão', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(makeClass());

      await service.cancel(admin, 'cl1');

      expect(classRepository.update).toHaveBeenCalledWith('cl1', {
        status: ClassStatus.CANCELLED,
      });
    });

    it('não cancela aula já encerrada', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({ status: ClassStatus.COMPLETED }),
      );

      await expect(service.cancel(admin, 'cl1')).rejects.toThrow(
        'Só é possível cancelar aulas que ainda estão agendadas',
      );
    });

    it('não encerra aula antes do horário de início', async () => {
      const { service, classRepository } = makeService();
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T16:00:00.000Z'));
      /* 16:00 UTC = 13:00 em São Paulo; a aula é 14:00. */
      classRepository.findOne.mockResolvedValue(makeClass());

      await expect(service.complete(admin, 'cl1')).rejects.toThrow(
        'Só é possível encerrar uma aula depois do horário de início',
      );
    });

    it('congela comissão e valor cobrado ao concluir aula no Cantinho', async () => {
      const { service, classRepository, regionRepository, planRepository } =
        makeService();
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T20:00:00.000Z'));
      classRepository.findOne.mockResolvedValue(
        makeClass({ durationMinutes: 90 }),
      );
      regionRepository.findOne.mockResolvedValue(cantinho);
      planRepository.findOne.mockResolvedValue({
        id: 'p1',
        hourPrice: '60.00',
      });

      await service.complete(admin, 'cl1');

      expect(classRepository.save).toHaveBeenCalledWith({
        id: 'cl1',
        status: ClassStatus.COMPLETED,
        region: cantinho,
        /* 1,5 h × R$ 25,00 de comissão da região */
        commissionAmount: '37.50',
        /* 1,5 h × R$ 60,00 do plano equivalente, sem desconto */
        amountCharged: '90.00',
      });
    });

    it('aula na casa do aluno usa a região do aluno, não a do Cantinho', async () => {
      const { service, classRepository, planRepository, regionRepository } =
        makeService();
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T20:00:00.000Z'));
      classRepository.findOne.mockResolvedValue(
        makeClass({
          locationType: LocationType.HOME,
          studentContract: makeContract({
            student: {
              id: 's1',
              region: vila,
              user: { id: 'user-aluno', name: 'João Silva' },
            },
          }),
        }),
      );
      planRepository.findOne.mockResolvedValue({ id: 'p2', hourPrice: '75.00' });

      await service.complete(admin, 'cl1');

      expect(regionRepository.findOne).not.toHaveBeenCalled();
      expect(classRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          region: vila,
          commissionAmount: '35.00',
          amountCharged: '75.00',
        }),
      );
    });

    it('aplica o desconto do contrato no valor cobrado', async () => {
      const { service, classRepository, regionRepository, planRepository } =
        makeService();
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T20:00:00.000Z'));
      classRepository.findOne.mockResolvedValue(
        makeClass({
          studentContract: makeContract({ discountPercentage: '10.00' }),
        }),
      );
      regionRepository.findOne.mockResolvedValue(cantinho);
      planRepository.findOne.mockResolvedValue({ id: 'p1', hourPrice: '60.00' });

      await service.complete(admin, 'cl1');

      expect(classRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCharged: '54.00',
          /* Desconto é do aluno: a comissão do professor não muda. */
          commissionAmount: '25.00',
        }),
      );
    });

    it('falta cobra igual e paga comissão igual', async () => {
      const { service, classRepository, regionRepository, planRepository } =
        makeService();
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T20:00:00.000Z'));
      classRepository.findOne.mockResolvedValue(makeClass());
      regionRepository.findOne.mockResolvedValue(cantinho);
      planRepository.findOne.mockResolvedValue({ id: 'p1', hourPrice: '60.00' });

      await service.markNoShow(admin, 'cl1');

      expect(classRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ClassStatus.NO_SHOW,
          commissionAmount: '25.00',
          amountCharged: '60.00',
        }),
      );
    });

    it('falha quando não existe plano equivalente na região da aula', async () => {
      const { service, classRepository, regionRepository, planRepository } =
        makeService();
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T20:00:00.000Z'));
      classRepository.findOne.mockResolvedValue(makeClass());
      regionRepository.findOne.mockResolvedValue(cantinho);
      planRepository.findOne.mockResolvedValue(null);

      await expect(service.complete(admin, 'cl1')).rejects.toThrow(
        'Plano equivalente não encontrado na região da aula',
      );
    });

    it('reabrir descongela os valores', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({
          status: ClassStatus.COMPLETED,
          region: cantinho,
          commissionAmount: '25.00',
          amountCharged: '60.00',
        }),
      );

      await service.reopen(admin, 'cl1');

      expect(classRepository.save).toHaveBeenCalledWith({
        id: 'cl1',
        status: ClassStatus.SCHEDULED,
        region: null,
        commissionAmount: null,
        amountCharged: null,
      });
    });

    it('não reabre quando outra aula tomou o horário', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({ status: ClassStatus.CANCELLED }),
      );
      classRepository.createQueryBuilder.mockReturnValue(fakeQueryBuilder(true));

      await expect(service.reopen(admin, 'cl1')).rejects.toThrow(
        ConflictException,
      );
      expect(classRepository.save).not.toHaveBeenCalled();
    });

    it('não reabre aula que já está agendada', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(makeClass());

      await expect(service.reopen(admin, 'cl1')).rejects.toThrow(
        'A aula já está agendada',
      );
    });
  });

  describe('acesso ao detalhe da aula', () => {
    it('professor de outra aula recebe 404, não 403', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({ teacher: makeTeacher({ user: { id: 'outro-user' } }) }),
      );

      await expect(service.findById(professor, 'cl1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('aluno de outra aula recebe 404', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({
          studentContract: makeContract({
            student: {
              id: 's9',
              region: cantinho,
              user: { id: 'outro-aluno', name: 'Outro' },
            },
          }),
        }),
      );

      await expect(service.findById(aluno, 'cl1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('admin vê comissão e valor cobrado', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({
          status: ClassStatus.COMPLETED,
          region: cantinho,
          commissionAmount: '25.00',
          amountCharged: '60.00',
        }),
      );

      const detail = await service.findById(admin, 'cl1');

      expect(detail.commissionAmount).toBe('25.00');
      expect(detail.amountCharged).toBe('60.00');
      expect(detail.region).toBe('Cantinho');
    });

    it('professor vê a própria comissão, mas não o que o aluno paga', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({
          status: ClassStatus.COMPLETED,
          commissionAmount: '25.00',
          amountCharged: '60.00',
        }),
      );

      const detail = await service.findById(professor, 'cl1');

      expect(detail.commissionAmount).toBe('25.00');
      expect(detail.amountCharged).toBeNull();
    });

    it('aluno não vê comissão nem valor cobrado', async () => {
      const { service, classRepository } = makeService();
      classRepository.findOne.mockResolvedValue(
        makeClass({
          status: ClassStatus.COMPLETED,
          commissionAmount: '25.00',
          amountCharged: '60.00',
        }),
      );

      const detail = await service.findById(aluno, 'cl1');

      expect(detail.commissionAmount).toBeNull();
      expect(detail.amountCharged).toBeNull();
    });
  });

  describe('números do painel e dos ganhos', () => {
    it('receita do mês soma o valor congelado das aulas faturáveis', async () => {
      const { service, classRepository } = makeService();
      classRepository.createQueryBuilder.mockReturnValue(
        fakeQueryBuilder({ revenue: '1320.00' }),
      );

      await expect(service.getMonthlyRevenue('2026-08')).resolves.toBe(1320);
    });

    it('receita zera quando não houve aula faturável', async () => {
      const { service, classRepository } = makeService();
      classRepository.createQueryBuilder.mockReturnValue(
        fakeQueryBuilder({ revenue: '0' }),
      );

      await expect(service.getCurrentMonthRevenue()).resolves.toBe(0);
    });

    it('ganhos do professor somam a comissão congelada do mês', async () => {
      const { service, classRepository } = makeService();
      classRepository.createQueryBuilder.mockReturnValue(
        fakeQueryBuilder({ amountToReceive: '450.00' }),
      );

      await expect(
        service.sumMonthlyEarningsByTeacher('user-prof', '2026-08'),
      ).resolves.toBe(450);
    });

    it('contagem do mês do professor usa o intervalo do mês pedido', async () => {
      const { service, classRepository } = makeService();
      classRepository.count.mockResolvedValue(9);

      await expect(
        service.countMonthlyByTeacher('user-prof', '2026-02'),
      ).resolves.toBe(9);

      const where = classRepository.count.mock.calls[0][0].where;
      /* Fevereiro de 2026 tem 28 dias — o fim do intervalo tem que ser o dia 28. */
      expect(JSON.stringify(where)).toContain('2026-02-01T00:00:00');
      expect(JSON.stringify(where)).toContain('2026-02-28T23:59:59');
    });

    it('distribui as aulas nas semanas do mês e devolve null nas vazias', async () => {
      const { service, classRepository } = makeService();
      classRepository.createQueryBuilder.mockReturnValue(
        fakeQueryBuilder([
          { scheduledAt: '2026-08-01T14:00:00' },
          { scheduledAt: '2026-08-07T14:00:00' },
          { scheduledAt: '2026-08-08T14:00:00' },
          { scheduledAt: '2026-08-31T14:00:00' },
        ]),
      );

      await expect(
        service.countWeeklyByTeacher('user-prof', '2026-08'),
      ).resolves.toEqual([
        { week: 1, count: 2 },
        { week: 2, count: 1 },
        { week: 3, count: null },
        { week: 4, count: null },
        { week: 5, count: 1 },
      ]);
    });
  });
});
