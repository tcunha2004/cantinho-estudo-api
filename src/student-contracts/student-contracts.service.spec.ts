import { NotFoundException } from '@nestjs/common';
import { StudentContractsService } from './student-contracts.service';
import { ContractStatus } from './enums/contract-status.enum';
import { ClassStatus } from '../classes/enums/class-status.enum';
import { PlanType } from '../plans/enums/plan-type.enum';
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
    save: jest.fn((data: Record<string, unknown>) => ({
      ...data,
      id: 'novo-contrato',
    })),
    createQueryBuilder: jest.fn(),
  };
  const classRepository = { update: jest.fn() };

  const service = new StudentContractsService(
    contractRepository as never,
    classRepository as never,
  );

  return { service, contractRepository, classRepository };
}

describe('StudentContractsService', () => {
  describe('update', () => {
    it('ativar não mexe nas aulas', async () => {
      const { service, classRepository } = makeService();

      await service.update('c1', { status: ContractStatus.ACTIVE });

      expect(classRepository.update).not.toHaveBeenCalled();
    });

    it('cancelar cancela em cascata só as aulas ainda agendadas', async () => {
      const { service, contractRepository, classRepository } = makeService();

      await service.update('c1', { status: ContractStatus.CANCELLED });

      expect(contractRepository.update).toHaveBeenCalledWith('c1', {
        status: ContractStatus.CANCELLED,
      });
      expect(classRepository.update).toHaveBeenCalledWith(
        { studentContract: { id: 'c1' }, status: ClassStatus.SCHEDULED },
        { status: ClassStatus.CANCELLED },
      );
    });
  });

  describe('replace', () => {
    it('lança 404 quando o contrato antigo não existe', async () => {
      const { service, contractRepository } = makeService();
      contractRepository.findOne.mockResolvedValue(null);

      await expect(
        service.replace('c1', { planId: 'p2', discountPercentage: null }),
      ).rejects.toThrow(NotFoundException);
    });

    it('cria o substituto, migra as aulas agendadas e fecha o antigo nessa ordem', async () => {
      const { service, contractRepository, classRepository } = makeService();
      contractRepository.findOne.mockResolvedValue({
        id: 'c1',
        student: { id: 's1' },
      });

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

      const created = await service.replace('c1', {
        planId: 'p2',
        discountPercentage: '15.00',
      });

      expect(created.id).toBe('c2');
      /* A ordem é a regra: migrar antes de fechar, senão a cascata de
       * cancelamento apagaria as aulas agendadas. */
      expect(order).toEqual(['save-novo', 'migra-aulas', 'fecha-antigo']);
      expect(contractRepository.create).toHaveBeenCalledWith({
        student: { id: 's1' },
        plan: { id: 'p2' },
        discountPercentage: '15.00',
        startDate: todayNaive(),
        status: ContractStatus.ACTIVE,
      });
      expect(classRepository.update).toHaveBeenCalledWith(
        { studentContract: { id: 'c1' }, status: ClassStatus.SCHEDULED },
        { studentContract: { id: 'c2' } },
      );
      expect(contractRepository.update).toHaveBeenCalledWith('c1', {
        status: ContractStatus.CANCELLED,
        endDate: todayNaive(),
      });
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
