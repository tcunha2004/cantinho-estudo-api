import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SignupLinkEntity, SignupGuardian } from './entity/signup-link.entity';
import { SignupStatus } from './enums/signup-status.enum';
import { CreateSignupLinkDto } from './dto/create-signup-link.dto';
import { UpdateSignupLinkDto } from './dto/update-signup-link.dto';
import { ApproveSignupDto } from './dto/approve-signup.dto';
import { SignupFormDto } from './dto/signup-form.dto';
import { WaitingSignupDto } from './dto/waiting-signup.dto';
import { UserEntity } from '../users/entity/user.entity';
import { HashPasswordPipe } from '../users/pipe/hash-password.pipe';
import { StudentEntity } from '../students/entity/student.entity';
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

/* Rascunho com tudo o que a aprovação precisa — ver `ensureComplete`. */
type CompleteSignupLink = SignupLinkEntity & {
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  password: string;
  region: RegionEntity;
  plan: PlanEntity;
  guardians: SignupGuardian[];
};

/* Prazo do link de cadastro. */
const LINK_TTL_DAYS = 7;

/* Desconto como o banco guarda: decimal(5,2) em string. */
function normalizeDiscount(value: string | null | undefined): string | null {
  return value === null || value === undefined || value === ''
    ? null
    : Number(value).toFixed(2);
}

/*
 * Fluxo de entrada de aluno novo: o admin gera um link, o aluno preenche o
 * formulário por fases (cada fase é um `updateDraft`), envia, e o admin aprova.
 * A aprovação é o único lugar do sistema que cria um aluno — até lá nada existe
 * fora de `signup_links`.
 */
@Injectable()
export class SignupLinksService {
  constructor(
    @InjectRepository(SignupLinkEntity)
    private readonly linkRepository: Repository<SignupLinkEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly regionsService: RegionsService,
    private readonly hashPassword: HashPasswordPipe,
    private readonly dataSource: DataSource,
  ) {}

  /*
   * Link para o admin enviar ao aluno, válido por LINK_TTL_DAYS dias.
   *
   * Gerar um link para um aluno revoga os que ainda estavam pendentes para o
   * mesmo e-mail: quando o admin gera de novo (link perdido, enviado para o
   * endereço errado), o anterior deixa de servir na hora. O e-mail é o que
   * identifica um aluno que ainda não existe — e é a mesma chave que
   * `ensureEmailIsFree` guarda.
   */
  public async create(
    adminUserId: string,
    { studentEmail }: CreateSignupLinkDto,
  ): Promise<{ id: string }> {
    await this.ensureEmailIsFree(studentEmail);
    await this.revokePendingFor(studentEmail);

    const link = await this.linkRepository.save(
      this.linkRepository.create({
        status: SignupStatus.PENDING,
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
   * refresh) mais a tabela de regiões e planos, que o aluno não teria como
   * buscar em `/regions/pricing` — aquilo é do admin.
   */
  public async findForm(id: string): Promise<SignupFormDto> {
    const link = await this.findPending(id);

    return {
      id: link.id,
      studentName: link.studentName,
      studentEmail: link.studentEmail,
      studentPhone: link.studentPhone,
      studentAddress: link.studentAddress,
      regionId: link.region?.id ?? null,
      planId: link.plan?.id ?? null,
      guardians: link.guardians,
      hasPassword: link.password !== null,
      regions: await this.regionsService.findPublicPricing(),
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

    return links.map((link) => {
      const complete = this.ensureComplete(link);

      return {
        id: complete.id,
        studentName: complete.studentName,
        studentEmail: complete.studentEmail,
        studentPhone: complete.studentPhone,
        studentAddress: complete.studentAddress,
        regionName: complete.region.name,
        enrollmentFee: complete.region.enrollmentFee,
        planId: complete.plan.id,
        planType: complete.plan.planType,
        frequency: complete.plan.frequency,
        monthlyPrice: complete.plan.monthlyPrice,
        hourPrice: complete.plan.hourPrice,
        classesCount: complete.plan.classesCount,
        validityMonths: complete.plan.validityMonths,
        guardians: complete.guardians,
        submittedAt: complete.submittedAt,
      };
    });
  }

  /*
   * Aprovação: o rascunho vira aluno de verdade. Tudo numa transação — um
   * `users` órfão, sem `students`, seria um e-mail queimado que impede o
   * cadastro de ser refeito.
   *
   * A regra de dinheiro não é reescrita aqui: vigência sai de
   * `resolveContractEndDate`, mensalidade de `monthlyAmount` e vencimento do
   * `DUE_DAY` — os mesmos que a troca de plano usa.
   */
  public async approve(
    id: string,
    dto: ApproveSignupDto,
  ): Promise<{ studentId: string }> {
    const discountPercentage = normalizeDiscount(dto.discountPercentage);

    return await this.dataSource.transaction(async (manager) => {
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

      await manager.getRepository(SignupLinkEntity).update(id, {
        status: SignupStatus.APPROVED,
        approvedAt: nowNaive(),
        student: { id: student.id },
      });

      return { studentId: student.id };
    });
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
   * O que a tela cobra fase a fase, cobrado de novo de uma vez só. Serve tanto
   * ao envio (o aluno pode ter burlado o formulário) quanto à aprovação e à
   * listagem, que leem uma linha que já deveria estar completa.
   */
  private ensureComplete(link: SignupLinkEntity): CompleteSignupLink {
    const missing = [
      [link.studentName, 'nome do aluno'],
      [link.studentEmail, 'e-mail'],
      [link.studentPhone, 'telefone'],
      [link.password, 'senha'],
      [link.region, 'região'],
      [link.plan, 'plano'],
      [link.guardians?.length ? link.guardians : null, 'responsáveis'],
    ].find(([value]) => !value)?.[1] as string | undefined;

    if (missing) {
      throw new BadRequestException(`Cadastro incompleto: falta ${missing}`);
    }

    const financial = link.guardians!.filter(
      (guardian) => guardian.isFinancialResponsible,
    );

    if (financial.length !== 1) {
      throw new BadRequestException(
        'Informe exatamente um responsável financeiro',
      );
    }

    return link as CompleteSignupLink;
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
