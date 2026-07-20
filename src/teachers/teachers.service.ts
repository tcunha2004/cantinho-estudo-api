import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherEntity } from './entity/teacher.entity';
import { ClassStatus } from '../classes/enums/class-status.enum';
import { getMonthRange } from '../utils/date-range.util';
import { TeachersEarningsSummaryDto } from './dto/teachers-earnings-summary.dto';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(TeacherEntity)
    private readonly teacherRepository: Repository<TeacherEntity>,
  ) {}

  /*
   * Ganhos por professor num mês (month no formato YYYY-MM): para cada
   * professor, conta as aulas com status completed cujo scheduled_at está
   * dentro do mês e soma as comissões congeladas (commission_amount) dessas
   * aulas. Professores sem aulas concluídas aparecem com 0. Também retorna os
   * totais gerais (aulas e valor a pagar) somando todos os professores.
   */
  public async getAllTeachersEarningsByMonth(
    month: string,
  ): Promise<TeachersEarningsSummaryDto> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);

    const rows = await this.teacherRepository
      .createQueryBuilder('teacher')
      .leftJoin('teacher.user', 'user')
      .leftJoin(
        'teacher.classes',
        'class',
        'class.status = :status AND class.scheduledAt BETWEEN :start AND :end',
        { status: ClassStatus.COMPLETED, start, end },
      )
      .select('teacher.id', 'id')
      .addSelect('user.name', 'name')
      .addSelect('COUNT(class.id)', 'completedClasses')
      .addSelect('COALESCE(SUM(class.commission_amount), 0)', 'amountToReceive')
      .groupBy('teacher.id')
      .addGroupBy('user.name')
      .orderBy('user.name', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        completedClasses: string;
        amountToReceive: string;
      }>();

    const teachers = rows.map((row) => ({
      id: row.id,
      name: row.name,
      completedClasses: Number(row.completedClasses),
      amountToReceive: row.amountToReceive,
    }));

    const totalCompletedClasses = teachers.reduce(
      (total, teacher) => total + teacher.completedClasses,
      0,
    );
    const totalAmountToReceive = teachers.reduce(
      (total, teacher) => total + Number(teacher.amountToReceive),
      0,
    );

    return { totalCompletedClasses, totalAmountToReceive, teachers };
  }
}
