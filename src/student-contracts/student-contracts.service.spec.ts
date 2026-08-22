import { NotFoundException } from '@nestjs/common';
import {
  monthlyAmount,
  resolveContractEndDate,
  StudentContractsService,
} from './student-contracts.service';
import { ContractStatus } from './enums/contract-status.enum';
import { ClassStatus } from '../classes/enums/class-status.enum';
import { PlanType } from '../plans/enums/plan-type.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { todayNaive } from '../utils/date-range.util';

function fakeQueryBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  for (const method of [
    'where',
    'select',
    'addSelect',
    'groupBy',
    'innerJoin',
  ]) {
    builder[method] = () => builder;
  }
  builder.getRawMany = () => Promise.resolve(rows);
  return builder;
}

function makeService() {
  const contractRepository = {
    update: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: Record<string, unknown>) =>
      Promise.resolve({ ...data, id: 'novo-contrato' }),
    ),
    createQueryBuilder: jest.fn(),
  };
  const classRepository = { update: jest.fn() };
  const paymentRepository = {
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
  };
  const planRepository = { findOne: jest.fn() };

  const service = new StudentContractsService(
    contractRepository as never,
    classRepository as never,
    paymentRepository as never,
    planRepository as never,
  );

  return {
    service,
    contractRepository,
    classRepository,
    paymentRepository,
    planRepository,
  };
}

const ouro = {
  id: 'p2',
  planType: PlanType.OURO,
  monthlyPrice: '1860.00',
  validityMonths: null,
};
const bronze = {
  id: 'p-bronze',
  planType: PlanType.BRONZE,
  monthlyPrice: '2000.00',
  validityMonths: 2,
};

describe('StudentContractsService', () => {
  describe('update', () => {
    it('ativar não mexe nas aulas', async () => {
      const { service, classRepository } = makeService();

      await service.update('c1', { status: ContractStatus.ACTIVE });

      expect(classRepository.update).not.toHaveBeenCalled();
    });

    it('cancelar cancela em cascata as aulas agendadas e descarta troca de plano agendada', async () => {
      const { service, contractRepository, classRepository } = makeService();

      await service.update('c1', { status: ContractStatus.CANCELLED });

      expect(contractRepository.update).toHaveBeenCalledWith('c1', {
        status: ContractStatus.CANCELLED,
        pendingPlan: null,
        pendingDiscountPercentage: null,
      });
      expect(classRepository.update).toHaveBeenCalledWith(
        { studentContract: { id: 'c1' }, status: ClassStatus.SCHEDULED },
        { status: ClassStatus.CANCELLED },
      );
    });
  });

  describe('schedulePlanChange / clearPendingPlanChange', () => {
    it('grava o plano e desconto pendentes', async () => {
      const { service, contractRepository } = makeService();

      await service.schedulePlanChange('c1', {
        planId: 'p2',
        discountPercentage: '15.00',
      });

      expect(contractRepository.update).toHaveBeenCalledWith('c1', {
        pendingPlan: { id: 'p2' },
        pendingDiscountPercentage: '15.00',
      });
    });

    it('limpa o pendente', async () => {
      const { service, contractRepository } = makeService();

      await service.clearPendingPlanChange('c1');

      expect(contractRepository.update).toHaveBeenCalledWith('c1', {
        pendingPlan: null,
        pendingDiscountPercentage: null,
      });
    });
  });

  describe('applyPendingPlanChange', () => {
    it('devolve null quando o contrato não existe ou não tem troca pendente', async () => {
      const { service, contractRepository } = makeService();
      contractRepository.findOne.mockResolvedValue(null);

      await expect(service.applyPendingPlanChange('c1')).resolves.toBeNull();

      contractRepository.findOne.mockResolvedValue({
        id: 'c1',
        student: { id: 's1' },
        pendingPlan: null,
      });

      await expect(service.applyPendingPlanChange('c1')).resolves.toBeNull();
      expect(contractRepository.save).not.toHaveBeenCalled();
    });

    it('lança 404 quando o plano alvo não existe', async () => {
      const { service, contractRepository, planRepository } = makeService();
      contractRepository.findOne.mockResolvedValue({
        id: 'c1',
        student: { id: 's1' },
        pendingPlan: { id: 'sumiu' },
        pendingDiscountPercentage: null,
      });
      planRepository.findOne.mockResolvedValue(null);

      await expect(service.applyPendingPlanChange('c1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cria o substituto vigente até dezembro, migra as aulas e fecha o antigo nessa ordem', async () => {
      const { service, contractRepository, classRepository, planRepository } =
        makeService();
      contractRepository.findOne.mockResolvedValue({
        id: 'c1',
        student: { id: 's1' },
        pendingPlan: { id: 'p2' },
        pendingDiscountPercentage: '15.00',
      });
      planRepository.findOne.mockResolvedValue(ouro);

      const order: string[] = [];
      contractRepository.save.mockImplementation((data: object) => {
        order.push('save-novo');
        return Promise.resolve({ ...data, id: 'c2' });
      });
      classRepository.update.mockImplementation(() => {
        order.push('migra-aulas');
        return Promise.resolve(undefined);
      });
      contractRepository.update.mockImplementation(() => {
        order.push('fecha-antigo');
        return Promise.resolve(undefined);
      });

      const created = await service.applyPendingPlanChange('c1');

      expect(created?.id).toBe('c2');
      /* A ordem é a regra: migrar antes de fechar, senão a cascata de
       * cancelamento apagaria as aulas agendadas. */
      expect(order).toEqual(['save-novo', 'migra-aulas', 'fecha-antigo']);
      expect(contractRepository.create).toHaveBeenCalledWith({
        student: { id: 's1' },
        plan: ouro,
        discountPercentage: '15.00',
        startDate: todayNaive(),
        endDate: `${todayNaive().slice(0, 4)}-12-31`,
        status: ContractStatus.ACTIVE,
      });
      expect(classRepository.update).toHaveBeenCalledWith(
        { studentContract: { id: 'c1' }, status: ClassStatus.SCHEDULED },
        { studentContract: { id: 'c2' } },
      );
      expect(contractRepository.update).toHaveBeenCalledWith('c1', {
        status: ContractStatus.CANCELLED,
        endDate: todayNaive(),
        pendingPlan: null,
        pendingDiscountPercentage: null,
      });
    });

    it('plano mensal começa a pagar no mês seguinte — o mês da troca ficou no contrato antigo', async () => {
      const { service, contractRepository, paymentRepository, planRepository } =
        makeService();
      contractRepository.findOne.mockResolvedValue({
        id: 'c1',
        student: { id: 's1' },
        pendingPlan: { id: 'p2' },
        pendingDiscountPercentage: '15.00',
      });
      planRepository.findOne.mockResolvedValue(ouro);
      contractRepository.save.mockImplementation((data: object) =>
        Promise.resolve({ ...data, id: 'c2' }),
      );

      await service.applyPendingPlanChange('c1');

      const [[parcela]] = paymentRepository.create.mock.calls as [
        [Record<string, unknown>],
      ];
      /* 1860 − 15% */
      expect(parcela.amount).toBe('1581.00');
      expect(parcela.status).toBe(PaymentStatus.PENDING);
      const [year, month] = todayNaive().split('-').map(Number);
      const proximo =
        month === 12
          ? `${year + 1}-01`
          : `${year}-${String(month + 1).padStart(2, '0')}`;
      expect(parcela.dueDate).toBe(`${proximo}-10`);
    });

    it('Bronze é pacote: parcela única já no mês da contratação', async () => {
      const { service, contractRepository, paymentRepository, planRepository } =
        makeService();
      contractRepository.findOne.mockResolvedValue({
        id: 'c1',
        student: { id: 's1' },
        pendingPlan: { id: 'p-bronze' },
        pendingDiscountPercentage: null,
      });
      planRepository.findOne.mockResolvedValue(bronze);
      contractRepository.save.mockImplementation((data: object) =>
        Promise.resolve({ ...data, id: 'c2' }),
      );

      await service.applyPendingPlanChange('c1');

      const [[parcela]] = paymentRepository.create.mock.calls as [
        [Record<string, unknown>],
      ];
      expect(parcela.amount).toBe('2000.00');
      expect(parcela.dueDate).toBe(`${todayNaive().slice(0, 7)}-10`);
    });
  });

  describe('vigência e mensalidade', () => {
    it('Bronze vale pela validade em meses; Ouro e Prata, até dezembro; avulsa não vence', () => {
      expect(resolveContractEndDate(bronze as never, '2026-05-01')).toBe(
        '2026-07-01',
      );
      expect(resolveContractEndDate(ouro as never, '2026-05-01')).toBe(
        '2026-12-31',
      );
      expect(
        resolveContractEndDate(
          { planType: PlanType.AVULSA, validityMonths: null } as never,
          '2026-05-01',
        ),
      ).toBeNull();
    });

    it('mensalidade é o preço do plano com o desconto; avulsa não tem mensalidade', () => {
      expect(monthlyAmount(ouro as never, null)).toBe('1860.00');
      expect(monthlyAmount(ouro as never, '10.00')).toBe('1674.00');
      expect(
        monthlyAmount(
          { planType: PlanType.AVULSA, monthlyPrice: '220.00' } as never,
          null,
        ),
      ).toBe('0.00');
    });
  });

  describe('countActiveByPlanType', () => {
    it('devolve todos os tipos, inclusive os zerados', async () => {
      const { service, contractRepository } = makeService();
      contractRepository.createQueryBuilder.mockReturnValue(
        fakeQueryBuilder([
          { planType: PlanType.OURO, count: '3' },
          { planType: PlanType.AVULSA, count: '1' },
        ]),
      );

      await expect(service.countActiveByPlanType()).resolves.toEqual({
        ouro: 3,
        prata: 0,
        bronze: 0,
        avulsa: 1,
      });
    });
  });
});
