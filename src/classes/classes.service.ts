import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, MoreThan, Repository } from 'typeorm';
import { ClassEntity } from './entity/class.entity';
import { ClassStatus } from './enums/class-status.enum';
import {
  getCurrentDayRange,
  getCurrentMonthRange,
  getCurrentWeekRange,
  getMonthRange,
} from '../utils/date-range.util';
import { WeeklyClassCountDto } from './dto/weekly-class-count.dto';

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
   * Receita do mês atual: soma o valor cobrado (amount_charged, congelado na
   * conclusão) das aulas completed no mês.
   */
  public async getCurrentMonthRevenue(): Promise<number> {
    const { start, end } = getCurrentMonthRange();
    return await this.sumRevenue(start, end);
  }

  /*
   * Receita de um mês específico (month no formato YYYY-MM): soma o valor
   * congelado cobrado por cada aula concluída no mês, independente do plano.
   * Ignora a comissão do professor.
   */
  public async getMonthlyRevenue(month: string): Promise<number> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);
    return await this.sumRevenue(start, end);
  }

  /*
   * Soma o valor cobrado do aluno (amount_charged) das aulas concluídas cujo
   * scheduled_at está dentro do intervalo. O valor é congelado na conclusão da
   * aula, já refletindo a duração real e o desconto do contrato — por isso não
   * há join com plan/contract e a receita histórica é imutável.
   */
  private async sumRevenue(start: string, end: string): Promise<number> {
    const result = await this.classRepository
      .createQueryBuilder('class')
      .where('class.status = :status', { status: ClassStatus.COMPLETED })
      .andWhere('class.scheduledAt BETWEEN :start AND :end', { start, end })
      .select('COALESCE(SUM(class.amount_charged), 0)', 'revenue')
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

  /*
   * Próximas aulas de um professor: aulas ainda agendadas cujo scheduled_at é
   * posterior ao momento atual, ordenadas por horário (mais próxima primeiro).
   */
  public async getUpcomingClassesByTeacher(
    teacherId: string,
  ): Promise<ClassEntity[]> {
    const now = new Date();

    return await this.classRepository.find({
      where: {
        status: ClassStatus.SCHEDULED,
        scheduledAt: MoreThan(now.toISOString()),
        teacher: { id: teacherId },
      },
      relations: {
        studentContract: { student: true },
        teacher: true,
        subject: true,
      },
      order: { scheduledAt: 'ASC' },
    });
  }

  /*
   * Quantidade de aulas que um professor teve num mês (month no formato
   * YYYY-MM): conta as aulas com status completed cujo scheduled_at está dentro
   * do mês — ou seja, as aulas que de fato aconteceram.
   */
  public async countMonthlyByTeacher(
    teacherId: string,
    month: string,
  ): Promise<number> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);

    return await this.classRepository.count({
      where: {
        status: ClassStatus.COMPLETED,
        scheduledAt: Between(start, end),
        teacher: { id: teacherId },
      },
    });
  }

  /*
   * Valor que um professor tem a receber num mês (month no formato YYYY-MM):
   * soma a comissão congelada (commission_amount) das aulas completed do
   * professor cujo scheduled_at está dentro do mês.
   */
  public async sumMonthlyEarningsByTeacher(
    teacherId: string,
    month: string,
  ): Promise<number> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);

    const result = await this.classRepository
      .createQueryBuilder('class')
      .innerJoin('class.teacher', 'teacher')
      .where('class.status = :status', { status: ClassStatus.COMPLETED })
      .andWhere('class.scheduledAt BETWEEN :start AND :end', { start, end })
      .andWhere('teacher.id = :teacherId', { teacherId })
      .select('COALESCE(SUM(class.commission_amount), 0)', 'amountToReceive')
      .getRawOne<{ amountToReceive: string }>();

    return Number(result?.amountToReceive ?? 0);
  }

  /*
   * Aulas por semana de um mês (month no formato YYYY-MM) de um professor.
   * O mês é dividido em blocos fixos de 7 dias a partir do dia 1 (semana 1 =
   * dias 1–7, semana 2 = 8–14, ...; a última semana pode ser parcial) e conta
   * todas as aulas do professor com scheduled_at em cada semana, independente
   * do status. Semanas sem aulas retornam count null.
   */
  public async countWeeklyByTeacher(
    teacherId: string,
    month: string,
  ): Promise<WeeklyClassCountDto[]> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);

    const rows = await this.classRepository
      .createQueryBuilder('class')
      .innerJoin('class.teacher', 'teacher')
      .where('teacher.id = :teacherId', { teacherId })
      .andWhere('class.scheduledAt BETWEEN :start AND :end', { start, end })
      .select('class.scheduledAt', 'scheduledAt')
      .getRawMany<{ scheduledAt: string | Date }>();

    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const totalWeeks = Math.ceil(daysInMonth / 7);
    const counts = new Array<number>(totalWeeks).fill(0);

    for (const row of rows) {
      const dayOfMonth = new Date(row.scheduledAt).getDate();
      const weekIndex = Math.ceil(dayOfMonth / 7) - 1;
      counts[weekIndex] += 1;
    }

    return counts.map((count, index) => ({
      week: index + 1,
      count: count === 0 ? null : count,
    }));
  }

  /*
   * Histórico recente de um professor: as 5 aulas mais recentes cujo
   * scheduled_at já passou, ordenadas da mais recente para a mais antiga.
   * Independe do status — cada aula carrega o seu (completed, cancelled, ...).
   */
  public async getRecentHistoryByTeacher(
    teacherId: string,
  ): Promise<ClassEntity[]> {
    const now = new Date();

    return await this.classRepository.find({
      where: {
        scheduledAt: LessThan(now.toISOString()),
        teacher: { id: teacherId },
      },
      relations: {
        studentContract: { student: true },
        teacher: true,
        subject: true,
      },
      order: { scheduledAt: 'DESC' },
      take: 5,
    });
  }
}
