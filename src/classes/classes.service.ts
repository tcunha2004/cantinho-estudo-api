import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ClassEntity } from './entity/class.entity';
import { ClassStatus } from './enums/class-status.enum';
import {
  getCurrentDayRange,
  getCurrentMonthRange,
  getCurrentWeekRange,
} from '../utils/date-range.util';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
  ) {}

  public async countCurrentWeek(): Promise<number> {
    const { start, end } = getCurrentWeekRange();

    return await this.classRepository.count({
      where: { scheduledAt: Between(start, end) },
    });
  }

  /*
   * Receita do mês atual: soma o hour_price do plano de cada aula com status
   * completed, filtrando pelo scheduled_at dentro do mês.
   */
  public async getCurrentMonthRevenue(): Promise<number> {
    const { start, end } = getCurrentMonthRange();

    const result = await this.classRepository
      .createQueryBuilder('class')
      .innerJoin('class.studentContract', 'contract')
      .innerJoin('contract.plan', 'plan')
      .where('class.status = :status', { status: ClassStatus.COMPLETED })
      .andWhere('class.scheduledAt BETWEEN :start AND :end', { start, end })
      .select('COALESCE(SUM(plan.hour_price), 0)', 'revenue')
      .getRawOne<{ revenue: string }>();

    return Number(result?.revenue ?? 0);
  }

  /*
   * Próximas aulas de hoje: aulas ainda agendadas cujo scheduled_at está entre
   * o momento atual e o fim do dia, ordenadas por horário (mais próxima primeiro).
   */
  public async getUpcomingClassesToday(): Promise<ClassEntity[]> {
    const now = new Date();
    const { end } = getCurrentDayRange(now);

    return await this.classRepository.find({
      where: {
        status: ClassStatus.SCHEDULED,
        scheduledAt: Between(now.toISOString(), end),
      },
      relations: {
        studentContract: { student: true },
        teacher: true,
        subject: true,
      },
      order: { scheduledAt: 'ASC' },
    });
  }
}
