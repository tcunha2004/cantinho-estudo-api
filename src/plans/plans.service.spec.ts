import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlanType } from './enums/plan-type.enum';

function makeService() {
  const planRepository = { findOne: jest.fn(), save: jest.fn() };
  const service = new PlansService(planRepository as never);
  return { service, planRepository };
}

function makePlan(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    planType: PlanType.OURO,
    frequency: null,
    monthlyPrice: '800.00',
    hourPrice: '70.00',
    classesCount: 8,
    validityMonths: null,
    ...over,
  };
}

describe('PlansService.update', () => {
  it('normaliza o preço para duas casas', async () => {
    const { service, planRepository } = makeService();
    planRepository.findOne.mockResolvedValue(makePlan());
    planRepository.save.mockImplementation((saved: unknown) => saved);

    const result = await service.update('p1', { monthlyPrice: '850.5' });

    expect(result.monthlyPrice).toBe('850.50');
  });

  it('deixa intacto o que não veio no corpo', async () => {
    const { service, planRepository } = makeService();
    planRepository.findOne.mockResolvedValue(makePlan());
    planRepository.save.mockImplementation((saved: unknown) => saved);

    const result = await service.update('p1', { monthlyPrice: '900' });

    expect(result.hourPrice).toBe('70.00');
    expect(result.classesCount).toBe(8);
  });

  it('aceita limpar a contagem de aulas com null', async () => {
    const { service, planRepository } = makeService();
    planRepository.findOne.mockResolvedValue(makePlan());
    planRepository.save.mockImplementation((saved: unknown) => saved);

    const result = await service.update('p1', { classesCount: null });

    expect(result.classesCount).toBeNull();
  });

  it('recusa preço negativo', async () => {
    const { service, planRepository } = makeService();
    planRepository.findOne.mockResolvedValue(makePlan());

    await expect(service.update('p1', { monthlyPrice: '-1' })).rejects.toThrow(
      BadRequestException,
    );

    expect(planRepository.save).not.toHaveBeenCalled();
  });

  it('plano inexistente é 404', async () => {
    const { service, planRepository } = makeService();
    planRepository.findOne.mockResolvedValue(null);

    await expect(service.update('sumiu', { monthlyPrice: '1' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
