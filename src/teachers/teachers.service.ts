import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherEntity } from './entity/teacher.entity';
import { BILLABLE_STATUSES } from '../classes/enums/class-status.enum';
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
   * aulas. Professores sem aulas concluídas aparecem com 0. Cada professor
   * traz também suas disciplinas e o valor por aula do mês. Também retorna os
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
        'class.status IN (:...billable) AND class.scheduledAt BETWEEN :start AND :end',
        { billable: BILLABLE_STATUSES, start, end },
      )
      .select('teacher.id', 'id')
      .addSelect('user.name', 'name')
      /*
       * Subconsulta em vez de join: as disciplinas são N:N e um join
       * multiplicaria as linhas, inflando a contagem de aulas e a soma das
       * comissões.
       */
      .addSelect(
        `(SELECT STRING_AGG(subject.name, ', ' ORDER BY subject.name)
            FROM teacher_subjects teacher_subject
            INNER JOIN subjects subject
              ON subject.id = teacher_subject.subject_id
           WHERE teacher_subject.teacher_id = teacher.id)`,
        'subject',
      )
      .addSelect('COUNT(class.id)', 'completedClasses')
      .addSelect('COALESCE(SUM(class.commission_amount), 0)', 'amountToReceive')
      .groupBy('teacher.id')
      .addGroupBy('user.name')
      .orderBy('user.name', 'ASC')
      .getRawMany<{
        id: string;
        name: string;
        subject: string | null;
        completedClasses: string;
        amountToReceive: string;
      }>();

    const teachers = rows.map((row) => {
      const completedClasses = Number(row.completedClasses);
      const amountToReceive = Number(row.amountToReceive);

      return {
        id: row.id,
        name: row.name,
        subject: row.subject ?? '',
        completedClasses,
        amountToReceive,
        amountPerClass: completedClasses
          ? amountToReceive / completedClasses
          : 0,
      };
    });

    const totalCompletedClasses = teachers.reduce(
      (total, teacher) => total + teacher.completedClasses,
      0,
    );
    const totalAmountToReceive = teachers.reduce(
      (total, teacher) => total + teacher.amountToReceive,
      0,
    );

    return { totalCompletedClasses, totalAmountToReceive, teachers };
  }
}
