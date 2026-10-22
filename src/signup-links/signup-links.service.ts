import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SignupLinkEntity, SignupGuardian } from './entity/signup-link.entity';
import { SignupStatus } from './enums/signup-status.enum';
import { CreateSignupLinkDto } from './dto/create-signup-link.dto';
import { UpdateSignupLinkDto } from './dto/update-signup-link.dto';
import { ApproveSignupDto } from './dto/approve-signup.dto';
import { SignupFormDto } from './dto/signup-form.dto';
import {
  WaitingSignupDto,
  WaitingStudentSignupDto,
  WaitingTeacherSignupDto,
} from './dto/waiting-signup.dto';
import { UserEntity } from '../users/entity/user.entity';
import { HashPasswordPipe } from '../users/pipe/hash-password.pipe';
import { StudentEntity } from '../students/entity/student.entity';
import { TeacherEntity } from '../teachers/entity/teacher.entity';
import { SubjectEntity } from '../subjects/entity/subject.entity';
import { SubjectsService } from '../subjects/subjects.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { GuardianEntity } from '../guardians/entity/guardian.entity';
import { RegionEntity } from '../regions/entity/region.entity';
import { RegionsService } from '../regions/regions.service';
import { PlanEntity } from '../plans/entity/plan.entity';
import { StudentContractEntity } from '../student-contracts/entity/student-contract.entity';
import { ContractStatus } from '../student-contracts/enums/contract-status.enum';
import {
  DUE_DAY,
  monthlyAmount,
  resolveContractEndDate,
} from '../student-contracts/student-contracts.service';
import { PaymentEntity } from '../payments/entity/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import {
  addMinutesToNaive,
  nowNaive,
  todayNaive,
} from '../utils/date-range.util';

/* O que todo rascunho precisa ter, seja de quem for — ver `ensureComplete`. */
type CompleteSignupLink = SignupLinkEntity & {
  studentName: string;
  studentEmail: string;
  password: string;
};

/* Rascunho de aluno pronto para aprovação. */
type CompleteStudentLink = CompleteSignupLink & {
  role: 'student';
  studentPhone: string;
  region: RegionEntity;
  plan: PlanEntity;
  guardians: SignupGuardian[];
};

/* Rascunho de professor pronto para aprovação. */
type CompleteTeacherLink = CompleteSignupLink & {
  role: 'professor';
  bio: string;
  subjectIds: string[];
};

/* O `role` é o discriminante: quem recebe isto ramifica por ele. */
type CompleteLink = CompleteStudentLink | CompleteTeacherLink;

/* Prazo do link de cadastro. */
const LINK_TTL_DAYS = 7;

/* Desconto como o banco guarda: decimal(5,2) em string. */
function normalizeDiscount(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === ''
    ? null
    : Number(value).toFixed(2);
}

/*
 * Fluxo de entrada de gente nova — aluno ou professor: o admin gera um link, a
 * pessoa preenche o formulário (cada fase é um `updateDraft`), envia, e o admin
 * aprova. A aprovação é o único lugar do sistema que cria aluno ou professor —
 * até lá nada existe fora de `signup_links`.
 *
 * O `role` do link é o que separa os dois: muda o que o formulário pede
 * (`ensureComplete`) e o que a aprovação escreve (`approve`). Prazo, revogação
 * e envio são os mesmos para os dois.
 */
@Injectable()
export class SignupLinksService {
  constructor(
    @InjectRepository(SignupLinkEntity)
    private readonly linkRepository: Repository<SignupLinkEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly regionsService: RegionsService,
    private readonly subjectsService: SubjectsService,
    private readonly hashPassword: HashPasswordPipe,
    private readonly dataSource: DataSource,
    private readonly whatsappService: WhatsappService,
  ) {}

  /*
   * Link para o admin enviar ao aluno ou ao professor, válido por
   * LINK_TTL_DAYS dias.
   *
   * Gerar um link revoga os que ainda estavam pendentes para o mesmo e-mail:
   * quando o admin gera de novo (link perdido, enviado para o endereço errado),
   * o anterior deixa de servir na hora. O e-mail é o que identifica quem ainda
   * não existe — e é a mesma chave que `ensureEmailIsFree` guarda. Vale entre
   * os dois papéis de propósito: o e-mail é único em `users`, então um link de
   * professor para um e-mail com link de aluno pendente cancela o de aluno.
   */
  public async create(
    adminUserId: string,
    { studentEmail, role }: CreateSignupLinkDto,
  ): Promise<{ id: string }> {
    await this.ensureEmailIsFree(studentEmail);
    await this.revokePendingFor(studentEmail);

    const link = await this.linkRepository.save(
      this.linkRepository.create({
        status: SignupStatus.PENDING,
        role: role ?? 'student',
        createdBy: { id: adminUserId },
        studentEmail,
        expiresAt: addMinutesToNaive(nowNaive(), LINK_TTL_DAYS * 24 * 60),
      }),
    );

    return { id: link.id };
  }

  /*
   * Revogação manual, pelo admin. É antecipar o vencimento: `findPending()` já
   * trata link vencido, então não há um segundo caminho de morte para manter.
   */
  public async revoke(id: string): Promise<void> {
    await this.findPending(id);
    await this.linkRepository.update(id, { expiresAt: nowNaive() });
  }

  /* Só os `pending`: cadastro já enviado não se revoga por gerar outro link. */
  private async revokePendingFor(studentEmail: string): Promise<void> {
    await this.linkRepository.update(
      { studentEmail, status: SignupStatus.PENDING },
      { expiresAt: nowNaive() },
    );
  }

  /*
   * Tela pública: o rascunho já preenchido (para o formulário sobreviver a um
   * refresh) mais as listas que quem preenche não teria como buscar —
   * regiões/planos em `/regions/pricing` e matérias em `/subjects` são do admin.
   *
   * Cada papel só carrega a lista que usa: um formulário de professor não
   * precisa da tabela de preços, e vice-versa.
   */
  public async findForm(id: string): Promise<SignupFormDto> {
    const link = await this.findPending(id);
    const isTeacher = link.role === 'professor';

    return {
      id: link.id,
      role: link.role,
      studentName: link.studentName,
      studentEmail: link.studentEmail,
      studentPhone: link.studentPhone,
      studentAddress: link.studentAddress,
      regionId: link.region?.id ?? null,
      planId: link.plan?.id ?? null,
      guardians: link.guardians,
      bio: link.bio,
      subjectIds: link.subjectIds,
      hasPassword: link.password !== null,
      regions: isTeacher ? [] : await this.regionsService.findPublicPricing(),
      subjects: isTeacher ? await this.subjectsService.findAll() : [],
    };
  }

  /*
   * Salva uma fase do formulário. Não muda o status: o link só vai para
   * `waiting` no envio do formulário completo (ver `submit`).
   *
   * A senha é transformada em hash aqui, no instante em que chega — assim a
   * coluna nunca guarda texto claro, nem enquanto o cadastro espera aprovação.
   */
  public async updateDraft(
    id: string,
    dto: UpdateSignupLinkDto,
  ): Promise<void> {
    await this.findPending(id);

    const { regionId, planId, password, guardians, ...rest } = dto;

    await this.linkRepository.update(id, {
      ...rest,
      ...(password !== undefined
        ? { password: await this.hashPassword.transform(password) }
        : {}),
      ...(regionId !== undefined ? { region: { id: regionId } } : {}),
      ...(planId !== undefined
        ? { plan: planId === null ? null : { id: planId } }
        : {}),
      ...(guardians !== undefined
        ? {
            guardians: guardians.map((guardian) => ({
              ...guardian,
              rg: guardian.rg?.trim() || null,
            })),
          }
        : {}),
    });
  }

  /*
   * Envio do formulário: revalida no servidor que está tudo lá — a tela já
   * bloqueia o avanço por fase, mas ela não é a autoridade — e só então promove
   * para `waiting`, que é o que acende o sino do admin.
   */
  public async submit(id: string): Promise<void> {
    const link = this.ensureComplete(await this.findPending(id));

    await this.ensureEmailIsFree(link.studentEmail);

    await this.linkRepository.update(id, {
      status: SignupStatus.WAITING,
      submittedAt: nowNaive(),
    });
  }

  /* Cadastros aguardando aprovação — alimenta o sino e o modal do admin. */
  public async findWaiting(): Promise<WaitingSignupDto[]> {
    const links = await this.linkRepository.find({
      where: { status: SignupStatus.WAITING },
      relations: { region: true, plan: true },
      order: { submittedAt: 'ASC' },
    });

    /*
     * Nome das matérias para os cadastros de professor. A lista mestra inteira
     * numa consulta só: são poucas dezenas de matérias, e filtrar por id daria
     * o mesmo trabalho.
     */
    const subjectsById = links.some((link) => link.role === 'professor')
      ? new Map(
          (await this.subjectsService.findAll()).map((subject) => [
            subject.id,
            subject.name,
          ]),
        )
      : new Map<string, string>();

    return links.map((link) =>
      link.role === 'professor'
        ? this.toWaitingTeacher(this.ensureTeacherComplete(link), subjectsById)
        : this.toWaitingStudent(this.ensureStudentComplete(link)),
    );
  }

  private toWaitingStudent(link: CompleteStudentLink): WaitingStudentSignupDto {
    return {
      role: 'student',
      id: link.id,
      studentName: link.studentName,
      studentEmail: link.studentEmail,
      studentPhone: link.studentPhone,
      studentAddress: link.studentAddress,
      regionName: link.region.name,
      enrollmentFee: link.region.enrollmentFee,
      planId: link.plan.id,
      planType: link.plan.planType,
      frequency: link.plan.frequency,
      monthlyPrice: link.plan.monthlyPrice,
      hourPrice: link.plan.hourPrice,
      classesCount: link.plan.classesCount,
      validityMonths: link.plan.validityMonths,
      guardians: link.guardians,
      submittedAt: link.submittedAt,
    };
  }

  private toWaitingTeacher(
    link: CompleteTeacherLink,
    subjectsById: Map<string, string>,
  ): WaitingTeacherSignupDto {
    return {
      role: 'professor',
      id: link.id,
      studentName: link.studentName,
      studentEmail: link.studentEmail,
      bio: link.bio,
      /* Matéria apagada depois do envio simplesmente não aparece. */
      subjects: link.subjectIds.flatMap((subjectId) => {
        const name = subjectsById.get(subjectId);
        return name ? [{ id: subjectId, name }] : [];
      }),
      submittedAt: link.submittedAt,
    };
  }

  /*
   * Aprovação: o rascunho vira aluno ou professor de verdade. Tudo numa
   * transação — um `users` órfão, sem `students`/`teachers`, seria um e-mail
   * queimado que impede o cadastro de ser refeito.
   *
   * Devolve o id do aluno ou do professor criado, conforme o papel do link.
   */
  public async approve(
    id: string,
    dto: ApproveSignupDto,
  ): Promise<{ id: string }> {
    const { result, notice } = await this.dataSource.transaction(
      async (manager) => {
        const found = await manager.getRepository(SignupLinkEntity).findOne({
          where: { id },
          relations: { region: true, plan: true },
        });

        if (!found) {
          throw new NotFoundException('Cadastro não encontrado');
        }

        if (found.status !== SignupStatus.WAITING) {
          throw new BadRequestException(
            'Este cadastro não está aguardando aprovação',
          );
        }

        const link = this.ensureComplete(found);

        /* O e-mail pode ter sido cadastrado entre o envio e a aprovação. */
        await this.ensureEmailIsFree(
          link.studentEmail,
          manager.getRepository(UserEntity),
        );

        const created =
          link.role === 'professor'
            ? await this.createTeacher(manager, link)
            : await this.createStudent(
                manager,
                link,
                normalizeDiscount(dto.discountPercentage),
              );

        await manager.getRepository(SignupLinkEntity).update(id, {
          status: SignupStatus.APPROVED,
          approvedAt: nowNaive(),
          /* `student_id` é do aluno; o professor não tem coluna equivalente. */
          student: created.studentId ? { id: created.studentId } : null,
        });

        return {
          result: { id: created.id },
          /* Só aluno recebe aviso. */
          notice:
            link.role === 'professor'
              ? null
              : {
                  id: created.id,
                  name: link.studentName,
                  phone: link.studentPhone,
                },
        };
      },
    );

    /*
     * Depois do commit e sem esperar: o WhatsApp nunca atrasa nem derruba a
     * aprovação. O `.catch` é a barreira contra uma rejeição solta derrubar o
     * processo, mesmo com o contrato de "nunca rejeita" do envio.
     */
    if (notice) {
      this.whatsappService.notifySignupApproved(notice).catch(() => undefined);
    }
    return result;
  }

  /*
   * Aluno: usuário, aluno, responsáveis, contrato e a primeira mensalidade.
   *
   * A regra de dinheiro não é reescrita aqui: vigência sai de
   * `resolveContractEndDate`, mensalidade de `monthlyAmount` e vencimento do
   * `DUE_DAY` — os mesmos que a troca de plano usa.
   */
  private async createStudent(
    manager: EntityManager,
    link: CompleteStudentLink,
    discountPercentage: string | null,
  ): Promise<{ id: string; studentId: string }> {
    const user = await manager.getRepository(UserEntity).save(
      manager.getRepository(UserEntity).create({
        name: link.studentName,
        email: link.studentEmail,
        password: link.password,
        role: 'student',
      }),
    );

    const student = await manager.getRepository(StudentEntity).save(
      manager.getRepository(StudentEntity).create({
        user,
        region: link.region,
        phone: link.studentPhone,
        address: link.studentAddress,
        active: true,
      }),
    );

    await manager.getRepository(GuardianEntity).save(
      link.guardians.map((guardian) =>
        manager.getRepository(GuardianEntity).create({
          ...guardian,
          student,
        }),
      ),
    );

    const startDate = todayNaive();
    const contract = await manager.getRepository(StudentContractEntity).save(
      manager.getRepository(StudentContractEntity).create({
        student,
        plan: link.plan,
        startDate,
        endDate: resolveContractEndDate(link.plan, startDate),
        discountPercentage,
        status: ContractStatus.ACTIVE,
      }),
    );

    /*
     * Primeira mensalidade: vence no mês corrente, mesmo que o dia 10 já
     * tenha passado — é o valor devido de fato, e o admin vê em atraso.
     */
    await manager.getRepository(PaymentEntity).save(
      manager.getRepository(PaymentEntity).create({
        studentContract: contract,
        amount: monthlyAmount(link.plan, discountPercentage),
        dueDate: `${startDate.slice(0, 7)}-${String(DUE_DAY).padStart(2, '0')}`,
        paidAt: null,
        status: PaymentStatus.PENDING,
      }),
    );

    return { id: student.id, studentId: student.id };
  }

  /*
   * Professor: usuário e professor, com as matérias que ele declarou. Sem
   * contrato nem parcela — professor recebe por comissão de aula dada, o que
   * já é calculado em cima de `classes`.
   */
  private async createTeacher(
    manager: EntityManager,
    link: CompleteTeacherLink,
  ): Promise<{ id: string; studentId: null }> {
    const user = await manager.getRepository(UserEntity).save(
      manager.getRepository(UserEntity).create({
        name: link.studentName,
        email: link.studentEmail,
        password: link.password,
        role: 'professor',
      }),
    );

    /*
     * As matérias vêm por id do rascunho: se alguma foi apagada nesse meio
     * tempo, o professor entra sem ela — o admin ajusta na tela dele.
     */
    const subjects = await manager.getRepository(SubjectEntity).findBy({
      id: In(link.subjectIds),
    });

    const teacher = await manager.getRepository(TeacherEntity).save(
      manager.getRepository(TeacherEntity).create({
        user,
        bio: link.bio,
        subjects,
        active: true,
      }),
    );

    return { id: teacher.id, studentId: null };
  }

  /*
   * Link que ainda aceita edição. 404 se não existe, 410 se já foi enviado ou
   * se venceu. Gargalo único de `findForm`, `updateDraft` e `submit`, então uma
   * checagem de prazo aqui cobre os três.
   */
  private async findPending(id: string): Promise<SignupLinkEntity> {
    const link = await this.linkRepository.findOne({
      where: { id },
      relations: { region: true, plan: true },
    });

    if (!link) {
      throw new NotFoundException('Link de cadastro não encontrado');
    }

    if (link.status !== SignupStatus.PENDING) {
      throw new GoneException('Este cadastro já foi enviado');
    }

    /* Vencido ou revogado — do ponto de vista de quem abre o link, o mesmo. */
    if (link.expiresAt <= nowNaive()) {
      throw new GoneException('Este link de cadastro expirou');
    }

    return link;
  }

  /*
   * O que a tela cobra campo a campo, cobrado de novo de uma vez só. Serve
   * tanto ao envio (quem preenche pode ter burlado o formulário) quanto à
   * aprovação e à listagem, que leem uma linha que já deveria estar completa.
   *
   * O que é obrigatório depende do papel: aluno tem região, plano e
   * responsáveis; professor tem apresentação e matérias.
   */
  private ensureComplete(link: SignupLinkEntity): CompleteLink {
    return link.role === 'professor'
      ? this.ensureTeacherComplete(link)
      : this.ensureStudentComplete(link);
  }

  private ensureStudentComplete(link: SignupLinkEntity): CompleteStudentLink {
    this.ensureFilled(link, [
      [link.studentPhone, 'telefone'],
      [link.region, 'região'],
      [link.plan, 'plano'],
      [link.guardians?.length ? link.guardians : null, 'responsáveis'],
    ]);

    const financial = link.guardians!.filter(
      (guardian) => guardian.isFinancialResponsible,
    );

    if (financial.length !== 1) {
      throw new BadRequestException(
        'Informe exatamente um responsável financeiro',
      );
    }

    return link as CompleteStudentLink;
  }

  private ensureTeacherComplete(link: SignupLinkEntity): CompleteTeacherLink {
    this.ensureFilled(link, [
      [link.bio?.trim() ? link.bio : null, 'apresentação'],
      [link.subjectIds?.length ? link.subjectIds : null, 'matérias'],
    ]);

    return link as CompleteTeacherLink;
  }

  /* Nome, e-mail e senha valem para os dois papéis; o resto vem por parâmetro. */
  private ensureFilled(
    link: SignupLinkEntity,
    extra: [unknown, string][],
  ): void {
    const missing = [
      [link.studentName, 'nome'],
      [link.studentEmail, 'e-mail'],
      [link.password, 'senha'],
      ...extra,
    ].find(([value]) => !value)?.[1] as string | undefined;

    if (missing) {
      throw new BadRequestException(`Cadastro incompleto: falta ${missing}`);
    }
  }

  private async ensureEmailIsFree(
    email: string,
    repository: Repository<UserEntity> = this.userRepository,
  ): Promise<void> {
    const existing = await repository.findOne({ where: { email } });

    if (existing) {
      throw new ConflictException('Já existe um usuário com este e-mail');
    }
  }
}
