import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  FindOptionsRelations,
  FindOptionsWhere,
  In,
  LessThan,
  MoreThan,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import { ClassEntity } from './entity/class.entity';
import { BILLABLE_STATUSES, ClassStatus } from './enums/class-status.enum';
import {
  addMinutesToNaive,
  getCurrentDayRange,
  getCurrentMonthRange,
  getCurrentWeekRange,
  getMonthRange,
  getNaiveDayRange,
  nowNaive,
  toNaiveIso,
  toNaiveTimestamp,
} from '../utils/date-range.util';
import { WeeklyClassCountDto } from './dto/weekly-class-count.dto';
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { AgendaClassDto } from './dto/agenda-class.dto';
import { ClassDetailDto } from './dto/class-detail.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { ClassFormOptionsDto } from './dto/class-form-options.dto';
import { StudentContractEntity } from '../student-contracts/entity/student-contract.entity';
import { ContractStatus } from '../student-contracts/enums/contract-status.enum';
import { TeacherEntity } from '../teachers/entity/teacher.entity';
import { UserPayload } from '../auth/auth.service';

/* Relações que a agenda e o detalhe da aula sempre precisam carregar. */
const CLASS_RELATIONS = {
  studentContract: { student: { user: true } },
  teacher: { user: true },
  subject: true,
} as const;

/*
 * Aulas nesses status ocupam o horário. A falta entra porque o professor esteve
 * à disposição — o horário foi consumido de fato. Só o cancelamento libera.
 */
const BLOCKING_STATUSES = [
  ClassStatus.SCHEDULED,
  ClassStatus.COMPLETED,
  ClassStatus.NO_SHOW,
];

/* Teto do intervalo da agenda — a tela pede no máximo uma semana por vez. */
const MAX_RANGE_DAYS = 62;

/* Valor monetário como o banco guarda: decimal(10,2) em string. */
function money(value: number): string {
  return value.toFixed(2);
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
    @InjectRepository(StudentContractEntity)
    private readonly contractRepository: Repository<StudentContractEntity>,
    @InjectRepository(TeacherEntity)
    private readonly teacherRepository: Repository<TeacherEntity>,
  ) {}

  public async countCurrentWeek(): Promise<number> {
    const { start, end } = getCurrentWeekRange();

    return await this.classRepository.count({
      where: { scheduledAt: Between(start, end) },
    });
  }

  /*
   * Receita do mês atual: soma o valor cobrado (amount_charged, congelado no
   * encerramento) das aulas cobráveis do mês.
   */
  public async getCurrentMonthRevenue(): Promise<number> {
    const { start, end } = getCurrentMonthRange();
    return await this.sumRevenue(start, end);
  }

  /*
   * Receita de um mês específico (month no formato YYYY-MM): soma o valor
   * congelado cobrado por cada aula cobrável do mês, independente do plano.
   * Ignora a comissão do professor.
   */
  public async getMonthlyRevenue(month: string): Promise<number> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);
    return await this.sumRevenue(start, end);
  }

  /*
   * Soma o valor cobrado do aluno (amount_charged) das aulas cobráveis
   * (realizadas e faltas) cujo scheduled_at está dentro do intervalo. O valor é
   * congelado no encerramento da aula, já refletindo a duração real e o desconto
   * do contrato — por isso não há join com plan/contract e a receita histórica
   * é imutável.
   */
  private async sumRevenue(start: string, end: string): Promise<number> {
    const result = await this.classRepository
      .createQueryBuilder('class')
      .where('class.status IN (:...billable)', { billable: BILLABLE_STATUSES })
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
    const { end } = getCurrentDayRange();

    return await this.classRepository.find({
      where: {
        status: ClassStatus.SCHEDULED,
        scheduledAt: Between(nowNaive(), end),
      },
      relations: {
        studentContract: { student: { user: true } },
        teacher: { user: true },
        subject: true,
      },
      order: { scheduledAt: 'ASC' },
    });
  }

  /*
   * Próximas aulas de um professor: aulas ainda agendadas cujo scheduled_at é
   * posterior ao momento atual, ordenadas por horário (mais próxima primeiro).
   *
   * O filtro atravessa a relação até users porque quem chega do token é o id do
   * usuário logado (payload.sub), não o id da linha em `teachers`.
   */
  public async getUpcomingClassesByTeacher(
    userId: string,
  ): Promise<ClassEntity[]> {
    return await this.classRepository.find({
      where: {
        status: ClassStatus.SCHEDULED,
        scheduledAt: MoreThan(nowNaive()),
        teacher: { user: { id: userId } },
      },
      relations: {
        studentContract: { student: { user: true } },
        teacher: { user: true },
        subject: true,
      },
      order: { scheduledAt: 'ASC' },
    });
  }

  /*
   * Quantidade de aulas que um professor teve num mês (month no formato
   * YYYY-MM): conta as aulas cobráveis cujo scheduled_at está dentro do mês —
   * as realizadas e as faltas. Fica lado a lado com os ganhos do mês na tela,
   * então precisa usar o mesmo critério, senão contagem e valor não fecham.
   */
  public async countMonthlyByTeacher(
    userId: string,
    month: string,
  ): Promise<number> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);

    return await this.classRepository.count({
      where: {
        status: In([...BILLABLE_STATUSES]),
        scheduledAt: Between(start, end),
        teacher: { user: { id: userId } },
      },
    });
  }

  /*
   * Valor que um professor tem a receber num mês (month no formato YYYY-MM):
   * soma a comissão congelada (commission_amount) das aulas cobráveis do
   * professor cujo scheduled_at está dentro do mês.
   */
  public async sumMonthlyEarningsByTeacher(
    userId: string,
    month: string,
  ): Promise<number> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);

    const result = await this.classRepository
      .createQueryBuilder('class')
      .innerJoin('class.teacher', 'teacher')
      .innerJoin('teacher.user', 'user')
      .where('class.status IN (:...billable)', { billable: BILLABLE_STATUSES })
      .andWhere('class.scheduledAt BETWEEN :start AND :end', { start, end })
      .andWhere('user.id = :userId', { userId })
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
    userId: string,
    month: string,
  ): Promise<WeeklyClassCountDto[]> {
    const [year, monthNumber] = month.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);

    const rows = await this.classRepository
      .createQueryBuilder('class')
      .innerJoin('class.teacher', 'teacher')
      .innerJoin('teacher.user', 'user')
      .where('user.id = :userId', { userId })
      .andWhere('class.scheduledAt BETWEEN :start AND :end', { start, end })
      .select('class.scheduledAt', 'scheduledAt')
      .getRawMany<{ scheduledAt: string | Date }>();

    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const totalWeeks = Math.ceil(daysInMonth / 7);
    const counts = new Array<number>(totalWeeks).fill(0);

    for (const row of rows) {
      const dayOfMonth = Number(toNaiveIso(row.scheduledAt).slice(8, 10));
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
    userId: string,
  ): Promise<ClassEntity[]> {
    return await this.classRepository.find({
      where: {
        scheduledAt: LessThan(nowNaive()),
        teacher: { user: { id: userId } },
      },
      relations: {
        studentContract: { student: { user: true } },
        teacher: { user: true },
        subject: true,
      },
      order: { scheduledAt: 'DESC' },
      take: 5,
    });
  }

  /*
   * ─── Agenda ───────────────────────────────────────────────────────────────
   *
   * Daqui para baixo os horários são strings ingênuas (sem fuso), casando com o
   * que a coluna `scheduled_at` guarda. Nada de `toISOString()`.
   */

  /*
   * Aulas de um intervalo de dias, para a grade da agenda. O mesmo endpoint
   * serve o dia (from === to) e a semana. O escopo vem do papel de quem pediu:
   * aluno vê só as suas, professor só as que dá, admin vê todas e pode filtrar
   * por professor e/ou aluno.
   */
  public async findAgenda(
    user: UserPayload,
    query: AgendaQueryDto,
  ): Promise<AgendaClassDto[]> {
    const { start, end } = this.resolveRange(query.from, query.to);

    const where: FindOptionsWhere<ClassEntity> = {
      scheduledAt: Between(start, end),
    };

    if (query.status) {
      where.status = query.status;
    }

    if (user.role === 'student') {
      where.studentContract = { student: { user: { id: user.sub } } };
    } else if (user.role === 'professor') {
      where.teacher = { user: { id: user.sub } };
    } else {
      if (query.teacherId) {
        where.teacher = { id: query.teacherId };
      }
      if (query.studentId) {
        where.studentContract = { student: { id: query.studentId } };
      }
    }

    const classes = await this.classRepository.find({
      where,
      relations: CLASS_RELATIONS,
      order: { scheduledAt: 'ASC' },
    });

    return classes.map((item) => this.toAgendaDto(item));
  }

  /*
   * Opções dos selects do formulário de aula, já escopadas pelo papel: o admin
   * escolhe o professor (e recebe as matérias de cada um junto, evitando uma
   * segunda requisição ao trocar de professor); o professor recebe apenas as
   * matérias que leciona. Alunos não chegam aqui — a rota é bloqueada.
   */
  public async findFormOptions(
    user: UserPayload,
  ): Promise<ClassFormOptionsDto> {
    const students = await this.findSelectableStudents();

    if (user.role === 'professor') {
      const teacher = await this.findTeacherByUserId(user.sub);

      return {
        teachers: [],
        subjects: this.toNamedRefs(teacher.subjects),
        students,
      };
    }

    const teachers = await this.teacherRepository.find({
      relations: { user: true, subjects: true },
    });

    return {
      teachers: teachers
        .map((teacher) => ({
          id: teacher.id,
          name: teacher.user.name,
          subjects: this.toNamedRefs(teacher.subjects),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      subjects: [],
      students,
    };
  }

  /* Detalhe de uma aula. Quem não tem acesso recebe 404, não 403 — não faz
   * sentido revelar que a aula existe. */
  public async findById(
    user: UserPayload,
    id: string,
  ): Promise<ClassDetailDto> {
    const item = await this.findAccessibleClass(user, id);

    return this.toDetailDto(user, item);
  }

  public async create(
    user: UserPayload,
    dto: CreateClassDto,
  ): Promise<ClassDetailDto> {
    const teacher = await this.resolveTeacher(user, dto.teacherId);
    this.assertTeacherTeachesSubject(teacher, dto.subjectId);

    const contract = await this.resolveActiveContract(dto.studentId);
    const scheduledAt = toNaiveTimestamp(dto.scheduledAt);
    const durationMinutes = dto.durationMinutes ?? 60;

    await this.assertNoConflicts({
      teacherId: teacher.id,
      studentId: dto.studentId,
      scheduledAt,
      durationMinutes,
    });

    const created = await this.classRepository.save(
      this.classRepository.create({
        studentContract: contract,
        teacher,
        subject: { id: dto.subjectId },
        region: null,
        scheduledAt,
        durationMinutes,
        locationType: dto.locationType,
        status: ClassStatus.SCHEDULED,
        commissionAmount: null,
        amountCharged: null,
        notes: dto.notes?.trim() || null,
      }),
    );

    return await this.findById(user, created.id);
  }

  public async update(
    user: UserPayload,
    id: string,
    dto: UpdateClassDto,
  ): Promise<ClassDetailDto> {
    const item = await this.findAccessibleClass(user, id);

    if (user.role === 'professor' && dto.teacherId) {
      throw new ForbiddenException(
        'Você só pode manter a aula com você como professor',
      );
    }

    /*
     * Aula encerrada tem valores congelados a partir de duração, plano e
     * região. Mexer em qualquer um desses campos depois deixaria o dinheiro
     * registrado sem relação com a aula — só a observação continua editável.
     */
    if (item.status !== ClassStatus.SCHEDULED && this.changesBeyondNotes(dto)) {
      throw new BadRequestException(
        'Aulas encerradas só permitem editar as observações',
      );
    }

    const teacher = dto.teacherId
      ? await this.findTeacherById(dto.teacherId)
      : await this.findTeacherById(item.teacher.id);

    const subjectId = dto.subjectId ?? item.subject.id;
    this.assertTeacherTeachesSubject(teacher, subjectId);

    const contract = dto.studentId
      ? await this.resolveActiveContract(dto.studentId)
      : item.studentContract;

    const scheduledAt = dto.scheduledAt
      ? toNaiveTimestamp(dto.scheduledAt)
      : toNaiveTimestamp(toNaiveIso(item.scheduledAt));
    const durationMinutes = dto.durationMinutes ?? item.durationMinutes;

    await this.assertNoConflicts({
      teacherId: teacher.id,
      studentId: contract.student.id,
      scheduledAt,
      durationMinutes,
      exceptClassId: item.id,
    });

    await this.classRepository.save({
      id: item.id,
      studentContract: contract,
      teacher,
      subject: { id: subjectId },
      scheduledAt,
      durationMinutes,
      locationType: dto.locationType ?? item.locationType,
      /* Campo ausente mantém o que havia; string vazia apaga a observação. */
      notes: dto.notes === undefined ? item.notes : dto.notes.trim() || null,
    });

    return await this.findById(user, item.id);
  }

  /* Cancelamento não gera cobrança nem comissão: nada a congelar. */
  public async cancel(user: UserPayload, id: string): Promise<ClassDetailDto> {
    const item = await this.findAccessibleClass(user, id);

    this.assertScheduled(item, 'cancelar');

    await this.classRepository.update(item.id, {
      status: ClassStatus.CANCELLED,
    });

    return await this.findById(user, item.id);
  }

  /* Aula realizada: aluno paga, professor recebe. */
  public async complete(
    user: UserPayload,
    id: string,
  ): Promise<ClassDetailDto> {
    return await this.finalize(user, id, ClassStatus.COMPLETED);
  }

  /* Falta sem aviso: cobra igual, porque o professor esteve à disposição. */
  public async markNoShow(
    user: UserPayload,
    id: string,
  ): Promise<ClassDetailDto> {
    return await this.finalize(user, id, ClassStatus.NO_SHOW);
  }

  /*
   * Encerra a aula e congela ali mesmo a região, a comissão do professor e o
   * valor cobrado do aluno. Congelar é o ponto central: preço de plano, comissão
   * de região e desconto de contrato mudam com o tempo, e o que já foi apurado
   * não pode mudar junto. Todo relatório financeiro lê esses valores.
   */
  private async finalize(
    user: UserPayload,
    id: string,
    status: ClassStatus.COMPLETED | ClassStatus.NO_SHOW,
  ): Promise<ClassDetailDto> {
    const item = await this.findAccessibleClass(user, id, {
      studentContract: { student: { user: true, region: true }, plan: true },
    });

    this.assertScheduled(item, 'encerrar');

    if (toNaiveIso(item.scheduledAt) > nowNaive()) {
      throw new BadRequestException(
        'Só é possível encerrar uma aula depois do horário de início',
      );
    }

    const hours = item.durationMinutes / 60;
    const { student, plan, discountPercentage } = item.studentContract;
    const discount = Number(discountPercentage ?? 0) / 100;

    await this.classRepository.save({
      id: item.id,
      status,
      region: student.region,
      commissionAmount: money(Number(student.region.classCommission) * hours),
      amountCharged: money(Number(plan.hourPrice) * hours * (1 - discount)),
    });

    return await this.findById(user, item.id);
  }

  /*
   * Reabre uma aula encerrada, devolvendo-a para "agendada" e descongelando os
   * valores. É a saída para um clique errado — restrita ao admin, para que o
   * professor não desfaça sozinho receita e comissão já apuradas.
   */
  public async reopen(user: UserPayload, id: string): Promise<ClassDetailDto> {
    const item = await this.findAccessibleClass(user, id);

    if (item.status === ClassStatus.SCHEDULED) {
      throw new BadRequestException('A aula já está agendada');
    }

    await this.classRepository.save({
      id: item.id,
      status: ClassStatus.SCHEDULED,
      region: null,
      commissionAmount: null,
      amountCharged: null,
    });

    return await this.findById(user, item.id);
  }

  private assertScheduled(item: ClassEntity, action: string): void {
    if (item.status !== ClassStatus.SCHEDULED) {
      throw new BadRequestException(
        `Só é possível ${action} aulas que ainda estão agendadas`,
      );
    }
  }

  /* Alguma alteração além da observação? Define o que uma aula encerrada aceita. */
  private changesBeyondNotes(dto: UpdateClassDto): boolean {
    const { notes: _ignored, ...rest } = dto;
    return Object.values(rest).some((value) => value !== undefined);
  }

  /* Valida o intervalo pedido e devolve os limites ingênuos para o BETWEEN. */
  private resolveRange(from: string, to: string) {
    if (to < from) {
      throw new BadRequestException('O fim do intervalo é anterior ao início');
    }

    const days =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000 +
      1;

    if (days > MAX_RANGE_DAYS) {
      throw new BadRequestException(
        `O intervalo da agenda não pode passar de ${MAX_RANGE_DAYS} dias`,
      );
    }

    return getNaiveDayRange(from, to);
  }

  /*
   * Professor só agenda para si mesmo; admin precisa dizer para quem. Em ambos
   * os casos as matérias vêm junto — o check de matéria logo depois sai grátis.
   */
  private async resolveTeacher(
    user: UserPayload,
    teacherId?: string,
  ): Promise<TeacherEntity> {
    if (user.role === 'professor') {
      const teacher = await this.findTeacherByUserId(user.sub);

      if (teacherId && teacherId !== teacher.id) {
        throw new ForbiddenException('Você só pode criar aulas para si mesmo');
      }

      return teacher;
    }

    if (!teacherId) {
      throw new BadRequestException('Informe o professor da aula');
    }

    return await this.findTeacherById(teacherId);
  }

  private async findTeacherByUserId(userId: string): Promise<TeacherEntity> {
    const teacher = await this.teacherRepository.findOne({
      where: { user: { id: userId } },
      relations: { user: true, subjects: true },
    });

    if (!teacher) {
      throw new NotFoundException('Professor não encontrado');
    }

    return teacher;
  }

  private async findTeacherById(id: string): Promise<TeacherEntity> {
    const teacher = await this.teacherRepository.findOne({
      where: { id },
      relations: { user: true, subjects: true },
    });

    if (!teacher) {
      throw new NotFoundException('Professor não encontrado');
    }

    return teacher;
  }

  /*
   * Cada professor dá aula apenas das suas matérias. A checagem mora aqui — e
   * não só no formulário — para a regra não depender da tela. De quebra,
   * garante que a matéria existe.
   */
  private assertTeacherTeachesSubject(
    teacher: TeacherEntity,
    subjectId: string,
  ): void {
    if (!teacher.subjects.some((subject) => subject.id === subjectId)) {
      throw new BadRequestException('O professor não leciona essa matéria');
    }
  }

  /*
   * A aula aponta para o contrato, não para o aluno. Vale o contrato ativo mais
   * recente — mesma regra que o painel do aluno usa.
   */
  private async resolveActiveContract(
    studentId: string,
  ): Promise<StudentContractEntity> {
    const contract = await this.contractRepository.findOne({
      where: { student: { id: studentId }, status: ContractStatus.ACTIVE },
      relations: { student: true },
      order: { startDate: 'DESC' },
    });

    if (!contract) {
      throw new BadRequestException(
        'O aluno não possui um contrato ativo. Cadastre um contrato antes de agendar aulas.',
      );
    }

    return contract;
  }

  /*
   * Bloqueia sobreposição de horário, para o professor e para o aluno. A aula
   * não tem coluna de fim, então o fim sai de `duration_minutes` no próprio SQL.
   */
  private async assertNoConflicts({
    teacherId,
    studentId,
    scheduledAt,
    durationMinutes,
    exceptClassId,
  }: {
    teacherId: string;
    studentId: string;
    scheduledAt: string;
    durationMinutes: number;
    exceptClassId?: string;
  }): Promise<void> {
    const endsAt = addMinutesToNaive(scheduledAt, durationMinutes);

    const overlapping = (): SelectQueryBuilder<ClassEntity> => {
      const builder = this.classRepository
        .createQueryBuilder('class')
        .where('class.status IN (:...blocking)', {
          blocking: BLOCKING_STATUSES,
        })
        .andWhere('class.scheduled_at < :endsAt', { endsAt })
        .andWhere(
          `class.scheduled_at + (class.duration_minutes * interval '1 minute') > :scheduledAt`,
          { scheduledAt },
        );

      return exceptClassId
        ? builder.andWhere('class.id != :exceptClassId', { exceptClassId })
        : builder;
    };

    const teacherConflict = await overlapping()
      .andWhere('class.teacher_id = :teacherId', { teacherId })
      .getExists();

    if (teacherConflict) {
      throw new ConflictException('O professor já tem uma aula nesse horário');
    }

    const studentConflict = await overlapping()
      .innerJoin('class.studentContract', 'contract')
      .andWhere('contract.student_id = :studentId', { studentId })
      .getExists();

    if (studentConflict) {
      throw new ConflictException('O aluno já tem uma aula nesse horário');
    }
  }

  /* Carrega a aula garantindo que quem pediu pode vê-la. 404 quando não pode. */
  private async findAccessibleClass(
    user: UserPayload,
    id: string,
    extraRelations: FindOptionsRelations<ClassEntity> = {},
  ): Promise<ClassEntity> {
    const item = await this.classRepository.findOne({
      where: { id },
      relations: { ...CLASS_RELATIONS, region: true, ...extraRelations },
    });

    const visible =
      item &&
      (user.role === 'admin' ||
        (user.role === 'professor' && item.teacher.user.id === user.sub) ||
        (user.role === 'student' &&
          item.studentContract.student.user.id === user.sub));

    if (!visible) {
      throw new NotFoundException('Aula não encontrada');
    }

    return item;
  }

  /*
   * Alunos ativos com contrato ativo — os únicos que podem receber uma aula.
   * A busca parte dos contratos e deduplica por aluno, já que nada impede um
   * aluno de ter mais de um contrato ativo.
   */
  private async findSelectableStudents() {
    const contracts = await this.contractRepository.find({
      where: { status: ContractStatus.ACTIVE, student: { active: true } },
      relations: { student: { user: true } },
    });

    const byStudentId = new Map(
      contracts.map((contract) => [
        contract.student.id,
        contract.student.user.name,
      ]),
    );

    return this.toNamedRefs(
      [...byStudentId].map(([id, name]) => ({ id, name })),
    );
  }

  private toNamedRefs(items: { id: string; name: string }[]) {
    return items
      .map(({ id, name }) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private toAgendaDto(item: ClassEntity): AgendaClassDto {
    const scheduledAt = toNaiveIso(item.scheduledAt);

    return {
      id: item.id,
      scheduledAt,
      endsAt: addMinutesToNaive(scheduledAt, item.durationMinutes),
      durationMinutes: item.durationMinutes,
      status: item.status,
      locationType: item.locationType,
      subject: { id: item.subject.id, name: item.subject.name },
      teacher: { id: item.teacher.id, name: item.teacher.user.name },
      student: {
        id: item.studentContract.student.id,
        name: item.studentContract.student.user.name,
      },
    };
  }

  /*
   * Valores congelados são sensíveis: a comissão só aparece para o professor
   * dono e para o admin; o valor cobrado do aluno, só para o admin.
   */
  private toDetailDto(user: UserPayload, item: ClassEntity): ClassDetailDto {
    const isAdmin = user.role === 'admin';
    const isOwnTeacher =
      user.role === 'professor' && item.teacher.user.id === user.sub;

    return {
      ...this.toAgendaDto(item),
      notes: item.notes,
      region: item.region?.name ?? null,
      commissionAmount: isAdmin || isOwnTeacher ? item.commissionAmount : null,
      amountCharged: isAdmin ? item.amountCharged : null,
      createdAt: toNaiveIso(item.createdAt),
      updatedAt: toNaiveIso(item.updatedAt),
    };
  }
}
