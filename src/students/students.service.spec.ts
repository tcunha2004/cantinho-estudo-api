import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StudentsService } from './students.service';
import { ContractStatus } from '../student-contracts/enums/contract-status.enum';
import { PlanType } from '../plans/enums/plan-type.enum';
import { Frequency } from '../plans/enums/frequency.enum';

/*
 * Repositórios mockados: o que se testa aqui é a regra, não o SQL. O que o
 * banco faz de verdade está coberto em test/api.e2e-spec.ts.
 */

/* Query builder encadeável que devolve sempre o mesmo raw. */
function fakeQueryBuilder(raw: unknown) {
  const builder: Record<string, unknown> = {};
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
    builder[method] = () => builder;
  }
  builder.getRawOne = () => Promise.resolve(raw);
  builder.getRawMany = () => Promise.resolve(raw);
  return builder;
}

function makeService(overrides: Record<string, unknown> = {}) {
  const studentRepository = {
    count: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const planRepository = { find: jest.fn(), findOne: jest.fn() };
  const paymentRepository = { find: jest.fn() };
  const classRepository = { createQueryBuilder: jest.fn() };
  const userRepository = { update: jest.fn() };
  const studentContractsService = { update: jest.fn(), replace: jest.fn() };
  const guardiansService = { update: jest.fn() };

  const service = new StudentsService(
    studentRepository as never,
    planRepository as never,
    paymentRepository as never,
    classRepository as never,
    userRepository as never,
    studentContractsService as never,
    guardiansService as never,
  );

  return {
    service,
    studentRepository,
    planRepository,
    paymentRepository,
    classRepository,
    userRepository,
    studentContractsService,
    guardiansService,
    ...overrides,
  };
}

const cantinho = { id: 'r-cantinho', name: 'Cantinho', slug: 'cantinho' };
const vila = { id: 'r-vila', name: 'Vila da Serra', slug: 'vila-da-serra' };

function makePlan(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'p1',
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    hourPrice: '60.00',
    monthlyPrice: '720.00',
    classesCount: 12,
    validityMonths: 1,
    region: cantinho,
    ...over,
  } as never;
}

function makeContract(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'c1',
    startDate: '2026-01-01',
    createdAt: '2026-01-01T09:00:00',
    endDate: null,
    status: ContractStatus.ACTIVE,
    discountPercentage: null,
    plan: makePlan(),
    ...over,
  } as never;
}

function makeStudent(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 's1',
    active: true,
    phone: '31999999999',
    address: 'Rua A, 100',
    user: { id: 'u1', name: 'Ana Souza', email: 'ana@teste.com' },
    region: cantinho,
    guardians: [],
    contracts: [makeContract()],
    ...over,
  } as never;
}

describe('StudentsService', () => {
  describe('countActive', () => {
    it('conta somente alunos ativos', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.count.mockResolvedValue(7);

      await expect(service.countActive()).resolves.toBe(7);
      expect(studentRepository.count).toHaveBeenCalledWith({
        where: { active: true },
      });
    });
  });

  describe('findAllActive', () => {
    it('ordena por nome e resume plano, responsável e região', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.find.mockResolvedValue([
        makeStudent({
          id: 's2',
          user: { id: 'u2', name: 'Bruno Lima', email: 'b@t.com' },
          guardians: [
            { name: 'Pai do Bruno', isFinancialResponsible: false },
            { name: 'Mãe do Bruno', isFinancialResponsible: true },
          ],
        }),
        makeStudent({ id: 's1' }),
      ]);

      const result = await service.findAllActive();

      expect(result.map((student) => student.name)).toEqual([
        'Ana Souza',
        'Bruno Lima',
      ]);
      /* Responsável financeiro ganha do primeiro da lista. */
      expect(result[1].guardian).toBe('Mãe do Bruno');
      expect(result[0].guardian).toBeNull();
      expect(result[0]).toMatchObject({
        plan: PlanType.OURO,
        frequency: Frequency.THREE_TIMES_WEEK,
        region: 'Cantinho',
        contractStatus: ContractStatus.ACTIVE,
      });
    });

    it('resume o contrato mais recente quando há histórico', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.find.mockResolvedValue([
        makeStudent({
          contracts: [
            makeContract({
              id: 'antigo',
              startDate: '2025-01-01',
              status: ContractStatus.CANCELLED,
              plan: makePlan({ planType: PlanType.BRONZE }),
            }),
            makeContract({ id: 'atual', startDate: '2026-06-01' }),
          ],
        }),
      ]);

      const [student] = await service.findAllActive();

      expect(student.plan).toBe(PlanType.OURO);
      expect(student.contractStatus).toBe(ContractStatus.ACTIVE);
    });
  });

  describe('findById', () => {
    it('lança 404 quando o aluno não existe', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    });

    it('empate na data de início decide pelo contrato criado depois', async () => {
      const { service, studentRepository } = makeService();
      /*
       * Duas trocas de plano no mesmo dia: o cancelado vem primeiro do banco,
       * mas o atual é o que foi criado depois.
       */
      studentRepository.findOne.mockResolvedValue(
        makeStudent({
          contracts: [
            makeContract({
              id: 'cancelado',
              startDate: '2026-08-17',
              createdAt: '2026-08-17T10:00:00',
              status: ContractStatus.CANCELLED,
            }),
            makeContract({
              id: 'vigente',
              startDate: '2026-08-17',
              createdAt: '2026-08-17T10:05:00',
            }),
          ],
        }),
      );

      const detail = await service.findById('s1');

      expect(detail.contracts[0].id).toBe('vigente');
      expect(detail.contracts[0].status).toBe(ContractStatus.ACTIVE);
    });

    it('devolve os contratos do mais recente para o mais antigo', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({
          contracts: [
            makeContract({ id: 'antigo', startDate: '2025-01-01' }),
            makeContract({ id: 'atual', startDate: '2026-06-01' }),
          ],
          guardians: [
            {
              name: 'Mãe',
              phone: '31988887777',
              cpf: '111.222.333-44',
              isFinancialResponsible: true,
            },
          ],
        }),
      );

      const detail = await service.findById('s1');

      expect(detail.contracts.map((contract) => contract.id)).toEqual([
        'atual',
        'antigo',
      ]);
      expect(detail.region).toEqual({ id: 'r-cantinho', name: 'Cantinho' });
      expect(detail.guardians[0].cpf).toBe('111.222.333-44');
      expect(detail).toMatchObject({
        name: 'Ana Souza',
        email: 'ana@teste.com',
        phone: '31999999999',
        active: true,
      });
    });
  });

  describe('update', () => {
    it('lança 404 quando o aluno não existe', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(null);

      await expect(service.update('x', { name: 'Nome' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('altera só o que veio no dto', async () => {
      const { service, studentRepository, userRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());

      await service.update('s1', { phone: '31900000000' });

      expect(userRepository.update).not.toHaveBeenCalled();
      expect(studentRepository.update).toHaveBeenCalledWith('s1', {
        phone: '31900000000',
      });
    });

    it('nome e email vão para o usuário, não para o aluno', async () => {
      const { service, studentRepository, userRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());

      await service.update('s1', { name: 'Ana S.', email: 'nova@teste.com' });

      expect(userRepository.update).toHaveBeenCalledWith('u1', {
        name: 'Ana S.',
        email: 'nova@teste.com',
      });
      expect(studentRepository.update).toHaveBeenCalledWith('s1', {});
    });

    it('inativa o aluno', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());

      await service.update('s1', { active: false });

      expect(studentRepository.update).toHaveBeenCalledWith('s1', {
        active: false,
      });
    });

    it('muta o status do contrato atual sem versionar', async () => {
      const { service, studentRepository, studentContractsService } =
        makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());

      await service.update('s1', { contractStatus: ContractStatus.CANCELLED });

      expect(studentContractsService.update).toHaveBeenCalledWith('c1', {
        status: ContractStatus.CANCELLED,
      });
      expect(studentContractsService.replace).not.toHaveBeenCalled();
    });

    it('versiona o contrato quando o plano muda', async () => {
      const { service, studentRepository, studentContractsService } =
        makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());

      await service.update('s1', { planId: 'p2' });

      expect(studentContractsService.replace).toHaveBeenCalledWith('c1', {
        planId: 'p2',
        discountPercentage: null,
      });
    });

    it('não versiona quando o plano enviado é o mesmo', async () => {
      const { service, studentRepository, studentContractsService } =
        makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());

      await service.update('s1', { planId: 'p1' });

      expect(studentContractsService.replace).not.toHaveBeenCalled();
    });

    it('não versiona quando o desconto muda só de formato ("10" x "10.00")', async () => {
      const { service, studentRepository, studentContractsService } =
        makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({
          contracts: [makeContract({ discountPercentage: '10.00' })],
        }),
      );

      await service.update('s1', { discountPercentage: '10' });

      expect(studentContractsService.replace).not.toHaveBeenCalled();
    });

    it('versiona quando o desconto muda de valor', async () => {
      const { service, studentRepository, studentContractsService } =
        makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({
          contracts: [makeContract({ discountPercentage: '10.00' })],
        }),
      );

      await service.update('s1', { discountPercentage: '15' });

      expect(studentContractsService.replace).toHaveBeenCalledWith('c1', {
        planId: 'p1',
        discountPercentage: '15.00',
      });
    });

    it('lança 400 ao editar contrato de aluno sem contrato', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({ contracts: [] }),
      );

      await expect(service.update('s1', { planId: 'p2' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('edita o responsável financeiro escolhido', async () => {
      const { service, studentRepository, guardiansService } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({
          guardians: [
            { id: 'g1', name: 'Primeiro', isFinancialResponsible: false },
            { id: 'g2', name: 'Financeiro', isFinancialResponsible: true },
          ],
        }),
      );

      await service.update('s1', { guardian: { name: 'Novo nome' } });

      expect(guardiansService.update).toHaveBeenCalledWith('g2', {
        name: 'Novo nome',
      });
    });

    it('lança 400 ao editar responsável de aluno sem responsável', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({ guardians: [] }),
      );

      await expect(
        service.update('s1', { guardian: { name: 'X' } }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findStudentPlan', () => {
    it('usa o plano da região do aluno e o equivalente do Cantinho', async () => {
      const { service, studentRepository, planRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({
          region: vila,
          contracts: [
            makeContract({
              discountPercentage: '10.00',
              plan: makePlan({ hourPrice: '75.00', region: vila }),
            }),
          ],
        }),
      );
      planRepository.findOne.mockResolvedValue(makePlan({ hourPrice: '60.00' }));

      const plan = await service.findStudentPlan('u1');

      expect(plan).toMatchObject({
        studentName: 'Ana Souza',
        hourPrice: '75.00',
        cantinhoHourPrice: '60.00',
        region: 'Vila da Serra',
        discountPercentage: '10.00',
        contractStatus: ContractStatus.ACTIVE,
      });
    });

    it('não busca equivalente quando o plano já é do Cantinho', async () => {
      const { service, studentRepository, planRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());

      const plan = await service.findStudentPlan('u1');

      expect(planRepository.findOne).not.toHaveBeenCalled();
      expect(plan.cantinhoHourPrice).toBe('60.00');
    });

    it('mostra o plano do contrato vigente, não do cancelado no mesmo dia', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({
          contracts: [
            makeContract({
              id: 'cancelado',
              startDate: '2026-08-17',
              createdAt: '2026-08-17T10:00:00',
              status: ContractStatus.CANCELLED,
              plan: makePlan({ planType: PlanType.BRONZE }),
            }),
            makeContract({
              id: 'vigente',
              startDate: '2026-08-17',
              createdAt: '2026-08-17T10:05:00',
            }),
          ],
        }),
      );

      const plan = await service.findStudentPlan('u1');

      expect(plan.contractId).toBe('vigente');
      expect(plan.contractStatus).toBe(ContractStatus.ACTIVE);
      expect(plan.planType).toBe(PlanType.OURO);
    });

    it('lança 404 quando o aluno não tem contrato', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({ contracts: [] }),
      );

      await expect(service.findStudentPlan('u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lança 404 quando não existe plano equivalente no Cantinho', async () => {
      const { service, studentRepository, planRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({
          contracts: [makeContract({ plan: makePlan({ region: vila }) })],
        }),
      );
      planRepository.findOne.mockResolvedValue(null);

      await expect(service.findStudentPlan('u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOtherPlans', () => {
    it('exclui o plano do contrato atual', async () => {
      const { service, studentRepository, planRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());
      planRepository.find.mockResolvedValue([
        makePlan({ id: 'p1' }),
        makePlan({ id: 'p2', planType: PlanType.PRATA }),
      ]);

      const plans = await service.findOtherPlans('u1');

      expect(plans).toHaveLength(1);
      expect(plans[0].planType).toBe(PlanType.PRATA);
    });

    it('devolve todos os planos da região quando o aluno não tem contrato', async () => {
      const { service, studentRepository, planRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(
        makeStudent({ contracts: [] }),
      );
      planRepository.find.mockResolvedValue([
        makePlan({ id: 'p1' }),
        makePlan({ id: 'p2' }),
      ]);

      await expect(service.findOtherPlans('u1')).resolves.toHaveLength(2);
    });
  });

  describe('findPaymentHistory', () => {
    it('apura o valor da parcela pelas aulas faturáveis do mês do vencimento', async () => {
      const { service, studentRepository, paymentRepository, classRepository } =
        makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());
      paymentRepository.find.mockResolvedValue([
        {
          id: 'pay1',
          amount: '999.00',
          dueDate: '2026-08-10',
          paidAt: null,
          status: 'pending',
          studentContract: { id: 'c1', plan: makePlan() },
        },
      ]);
      classRepository.createQueryBuilder.mockReturnValue(
        fakeQueryBuilder({ amount: '540', classesCount: '9' }),
      );

      const [payment] = await service.findPaymentHistory('u1');

      /* Ignora payments.amount: o valor vem das aulas. */
      expect(payment.amount).toBe('540.00');
      expect(payment.classesCount).toBe(9);
      expect(payment.planType).toBe(PlanType.OURO);
    });

    it('devolve zero quando o mês não teve aula faturável', async () => {
      const { service, studentRepository, paymentRepository, classRepository } =
        makeService();
      studentRepository.findOne.mockResolvedValue(makeStudent());
      paymentRepository.find.mockResolvedValue([
        {
          id: 'pay1',
          amount: '999.00',
          dueDate: '2026-08-10',
          paidAt: null,
          status: 'pending',
          studentContract: { id: 'c1', plan: makePlan() },
        },
      ]);
      classRepository.createQueryBuilder.mockReturnValue(
        fakeQueryBuilder({ amount: '0', classesCount: '0' }),
      );

      const [payment] = await service.findPaymentHistory('u1');

      expect(payment.amount).toBe('0.00');
      expect(payment.classesCount).toBe(0);
    });

    it('lança 404 quando o aluno não existe', async () => {
      const { service, studentRepository } = makeService();
      studentRepository.findOne.mockResolvedValue(null);

      await expect(service.findPaymentHistory('u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
