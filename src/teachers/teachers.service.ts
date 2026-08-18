import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TeacherEntity } from './entity/teacher.entity';
import { UserEntity } from '../users/entity/user.entity';
import { SubjectEntity } from '../subjects/entity/subject.entity';
import { BILLABLE_STATUSES } from '../classes/enums/class-status.enum';
import { getMonthRange } from '../utils/date-range.util';
import { TeachersEarningsSummaryDto } from './dto/teachers-earnings-summary.dto';
import { TeacherDetailDto } from './dto/teacher-detail.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(TeacherEntity)
    private readonly teacherRepository: Repository<TeacherEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepository: Repository<SubjectEntity>,
  ) {}

  /* Dados completos de um professor para o modal de visualização/edição do admin. */
  public async findById(id: string): Promise<TeacherDetailDto> {
    const teacher = await this.teacherRepository.findOne({
      where: { id },
      relations: { user: true, subjects: true },
    });

    if (!teacher) {
      throw new NotFoundException('Professor não encontrado');
    }

    return {
      id: teacher.id,
      name: teacher.user.name,
      email: teacher.user.email,
      bio: teacher.bio,
      active: teacher.active,
      subjects: teacher.subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
      })),
    };
  }

  /*
   * Edita os dados cadastrais do professor (nome/email vivem no usuário, o
   * resto na própria tabela) e permite inativá-lo. Só altera o que veio no
   * dto — `subjectIds`, quando enviado, substitui a lista de matérias.
   */
  public async update(
    id: string,
    dto: UpdateTeacherDto,
  ): Promise<TeacherDetailDto> {
    const teacher = await this.teacherRepository.findOne({
      where: { id },
      relations: { user: true },
    });

    if (!teacher) {
      throw new NotFoundException('Professor não encontrado');
    }

    const { name, email, bio, subjectIds, active } = dto;

    if (name !== undefined || email !== undefined) {
      await this.userRepository.update(teacher.user.id, {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
      });
    }

    if (bio !== undefined || active !== undefined) {
      await this.teacherRepository.update(id, {
        ...(bio !== undefined ? { bio } : {}),
        ...(active !== undefined ? { active } : {}),
      });
    }

    if (subjectIds !== undefined) {
      const subjects = await this.subjectRepository.find({
        where: { id: In(subjectIds) },
      });
      /*
       * Salva só o id e as matérias. Salvar a entidade carregada no início do
       * método reescreveria as colunas com os valores de antes do update acima
       * — bio e active voltariam ao que eram.
       */
      await this.teacherRepository.save({ id, subjects });
    }

    return await this.findById(id);
  }

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
      .where('teacher.active = true')
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

    const teachers = rows.map((row) => ({
      id: row.id,
      name: row.name,
      subject: row.subject ?? '',
      completedClasses: Number(row.completedClasses),
      amountToReceive: Number(row.amountToReceive),
    }));

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
