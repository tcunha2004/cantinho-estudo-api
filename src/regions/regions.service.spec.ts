import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { PlanType } from '../plans/enums/plan-type.enum';
import { Frequency } from '../plans/enums/frequency.enum';

function makeService() {
  const regionRepository = { find: jest.fn() };
  const service = new RegionsService(regionRepository as never);
  return { service, regionRepository };
}

function makePlan(over: Record<string, unknown> = {}) {
  return {
    id: 'p',
    planType: PlanType.BRONZE,
    frequency: null,
    monthlyPrice: '400.00',
    hourPrice: '50.00',
    classesCount: 8,
    validityMonths: 1,
    ...over,
  };
}

describe('RegionsService.findPricing', () => {
  it('só traz regiões ativas', async () => {
    const { service, regionRepository } = makeService();
    regionRepository.find.mockResolvedValue([]);

    await service.findPricing();

    expect(regionRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it('ordena os planos do mais completo ao mais simples e por frequência', async () => {
    const { service, regionRepository } = makeService();
    regionRepository.find.mockResolvedValue([
      {
        id: 'r1',
        name: 'Cantinho',
        slug: 'cantinho',
        enrollmentFee: '100.00',
        classCommission: '25.00',
        plans: [
          makePlan({ id: 'avulsa', planType: PlanType.AVULSA }),
          makePlan({
            id: 'ouro-5',
            planType: PlanType.OURO,
            frequency: Frequency.FIVE_TIMES_WEEK,
          }),
          makePlan({ id: 'prata', planType: PlanType.PRATA }),
          makePlan({
            id: 'ouro-2',
            planType: PlanType.OURO,
            frequency: Frequency.TWICE_WEEK,
          }),
          makePlan({ id: 'bronze', planType: PlanType.BRONZE }),
        ],
      },
    ]);

    const [region] = await service.findPricing();

    expect(region.plans.map((plan) => plan.id)).toEqual([
      'ouro-2',
      'ouro-5',
      'prata',
      'bronze',
      'avulsa',
    ]);
  });

  it('expõe taxa de matrícula e comissão por hora da região', async () => {
    const { service, regionRepository } = makeService();
    regionRepository.find.mockResolvedValue([
      {
        id: 'r2',
        name: 'Vila da Serra',
        slug: 'vila-da-serra',
        enrollmentFee: '150.00',
        classCommission: '30.00',
        plans: [],
      },
    ]);

    await expect(service.findPricing()).resolves.toEqual([
      {
        id: 'r2',
        name: 'Vila da Serra',
        slug: 'vila-da-serra',
        enrollmentFee: '150.00',
        classCommission: '30.00',
        plans: [],
      },
    ]);
  });
});

describe('RegionsService.update', () => {
  function makeUpdatableService() {
    const regionRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const service = new RegionsService(regionRepository as never);
    return { service, regionRepository };
  }

  function makeRegion(over: Record<string, unknown> = {}) {
    return {
      id: 'r1',
      name: 'Cantinho',
      slug: 'cantinho',
      enrollmentFee: '100.00',
      classCommission: '25.00',
      plans: [],
      ...over,
    };
  }

  it('normaliza as taxas para duas casas', async () => {
    const { service, regionRepository } = makeUpdatableService();
    regionRepository.findOne.mockResolvedValue(makeRegion());
    regionRepository.save.mockImplementation((saved: unknown) => saved);

    const result = await service.update('r1', {
      enrollmentFee: '120',
      classCommission: '27.5',
    });

    expect(result.enrollmentFee).toBe('120.00');
    expect(result.classCommission).toBe('27.50');
  });

  it('recusa taxa negativa', async () => {
    const { service, regionRepository } = makeUpdatableService();
    regionRepository.findOne.mockResolvedValue(makeRegion());

    await expect(
      service.update('r1', { enrollmentFee: '-5' }),
    ).rejects.toThrow(BadRequestException);

    expect(regionRepository.save).not.toHaveBeenCalled();
  });

  it('região inexistente é 404', async () => {
    const { service, regionRepository } = makeUpdatableService();
    regionRepository.findOne.mockResolvedValue(null);

    await expect(
      service.update('sumiu', { enrollmentFee: '1' }),
    ).rejects.toThrow(NotFoundException);
  });
});
