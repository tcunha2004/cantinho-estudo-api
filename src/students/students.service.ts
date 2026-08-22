import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsRelations, Repository } from 'typeorm';
import { StudentEntity } from './entity/student.entity';
import { StudentContractEntity } from '../student-contracts/entity/student-contract.entity';
import {
  monthlyAmount,
  StudentContractsService,
} from '../student-contracts/student-contracts.service';
import { ContractStatus } from '../student-contracts/enums/contract-status.enum';
import { GuardianEntity } from '../guardians/entity/guardian.entity';
import { GuardiansService } from '../guardians/guardians.service';
import { PlanEntity } from '../plans/entity/plan.entity';
import { PlanType } from '../plans/enums/plan-type.enum';
import { PaymentEntity } from '../payments/entity/payment.entity';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import { ClassEntity } from '../classes/entity/class.entity';
import { UserEntity } from '../users/entity/user.entity';
import { BILLABLE_STATUSES } from '../classes/enums/class-status.enum';
import {
  addMonthsToDate,
  getMonthRange,
  nowNaive,
} from '../utils/date-range.util';
import { CompactStudentDto, StudentStatus } from './dto/compact-student.dto';
import { StudentPlanDto } from './dto/student-plan.dto';
import { PlanSummaryDto } from './dto/plan-summary.dto';
import { PaymentHistoryDto } from './dto/payment-history.dto';
import { StudentDetailDto } from './dto/student-detail.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

/* Valor monetário como o banco guarda: decimal(10,2) em string. */
function money(value: number): string {
  return value.toFixed(2);
}

/*
 * Ordem do histórico de contratos: do mais recente para o mais antigo. Empate
 * na data de início decide pelo mais recém-criado — trocar de plano duas vezes
 * no mesmo dia cria dois contratos com o mesmo `start_date`, e sem esse
 * critério o "contrato atual" podia cair no que acabou de ser cancelado.
 */
function byMostRecent(
  a: StudentContractEntity,
  b: StudentContractEntity,
): number {
  return (
    b.startDate.localeCompare(a.startDate) ||
    b.createdAt.localeCompare(a.createdAt)
  );
}

/*
 * Desconto como o banco guarda: decimal(5,2) em string. Normaliza antes de
 * comparar com o valor atual do contrato, senão "10" nunca bate com "10.00" e
 * cria um contrato novo à toa a cada salvamento.
 */
function normalizeDiscount(value: string | null): string | null {
  return value === null ? null : Number(value).toFixed(2);
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepository: Repository<PlanEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly studentContractsService: StudentContractsService,
    private readonly guardiansService: GuardiansService,
  ) {}

  public async countActive(): Promise<number> {
    return await this.studentRepository.count({ where: { active: true } });
  }

  public async findAll(): Promise<CompactStudentDto[]> {
    const students = await this.studentRepository.find({
      relations: {
        user: true,
        guardians: true,
        region: true,
        contracts: { plan: true },
      },
    });
    return students
      .map((student) => {
        const guardian = this.pickGuardian(student.guardians);
        const contract = this.pickCurrentContract(student.contracts);

        return {
          id: student.id,
          name: student.user.name,
          status: student.active
            ? StudentStatus.ACTIVE
            : StudentStatus.INACTIVE,
          guardian: guardian?.name ?? null,
          plan: contract?.plan.planType ?? null,
          frequency: contract?.plan.frequency ?? null,
          region: student.region?.name ?? null,
          contractStatus: contract?.status ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async findAllActive(): Promise<CompactStudentDto[]> {
    const allstudents = await this.findAll();
    return allstudents.filter(
      (student) => student.contractStatus === ContractStatus.ACTIVE,
    );
  }

  /* Dados completos de um aluno para o modal de visualização/edição do admin. */
  public async findById(id: string): Promise<StudentDetailDto> {
    const student = await this.studentRepository.findOne({
      where: { id },
      relations: {
        user: true,
        region: true,
        guardians: true,
        contracts: { plan: true, pendingPlan: true },
      },
    });

    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }

    return {
      id: student.id,
      name: student.user.name,
      email: student.user.email,
      phone: student.phone,
      address: student.address,
      active: student.active,
      region: { id: student.region.id, name: student.region.name },
      guardians: student.guardians.map((guardian) => ({
        name: guardian.name,
        phone: guardian.phone,
        cpf: guardian.cpf,
        isFinancialResponsible: guardian.isFinancialResponsible,
      })),
      contracts: [...student.contracts].sort(byMostRecent).map((contract) => ({
        id: contract.id,
        planId: contract.plan.id,
        planType: contract.plan.planType,
        frequency: contract.plan.frequency,
        status: contract.status,
        startDate: contract.startDate,
        endDate: contract.endDate,
        discountPercentage: contract.discountPercentage,
        pendingPlanId: contract.pendingPlan?.id ?? null,
        pendingPlanType: contract.pendingPlan?.planType ?? null,
        pendingDiscountPercentage: contract.pendingDiscountPercentage,
      })),
    };
  }

  /*
   * Edita os dados cadastrais do aluno (nome/email vivem no usuário, o resto
   * na própria tabela), o contrato atual (status muta; plano/desconto
   * versionam — ver StudentContractsService) e o responsável financeiro. Só
   * altera o que veio no dto. Inativar (active: false) cancela em cascata o
   * contrato vigente e, por tabela, as aulas ainda agendadas.
   */
  public async update(
    id: string,
    dto: UpdateStudentDto,
  ): Promise<StudentDetailDto> {
    const student = await this.studentRepository.findOne({
      where: { id },
      relations: {
        user: true,
        guardians: true,
        contracts: { plan: true, pendingPlan: true },
      },
    });

    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }

    const {
      name,
      email,
      phone,
      address,
      regionId,
      active,
      contractStatus,
      planId,
      discountPercentage,
      guardian,
    } = dto;

    if (name !== undefined || email !== undefined) {
      await this.userRepository.update(student.user.id, {
        ...(name !== undefined ? { name } : {}),
        ...(email !== undefined ? { email } : {}),
      });
    }

    await this.studentRepository.update(id, {
      ...(phone !== undefined ? { phone } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(regionId !== undefined ? { region: { id: regionId } } : {}),
      ...(active !== undefined ? { active } : {}),
    });

    /*
     * Inativar não é só sair da lista de ativos: cancela o contrato vigente,
     * que por cascata (StudentContractsService.update) cancela as aulas ainda
     * agendadas. Sem isso, o contrato continuava ativo e as aulas podiam ser
     * encerradas, gerando cobrança e comissão para um aluno inativo.
     */
    if (active === false) {
      const activeContract = this.pickCurrentContract(student.contracts);

      if (activeContract && activeContract.status === ContractStatus.ACTIVE) {
        await this.studentContractsService.update(activeContract.id, {
          status: ContractStatus.CANCELLED,
        });
      }
    }

    if (
      contractStatus !== undefined ||
      planId !== undefined ||
      discountPercentage !== undefined
    ) {
      const currentContract = this.pickCurrentContract(student.contracts);

      if (!currentContract) {
        throw new BadRequestException(
          'Aluno não possui um contrato para editar',
        );
      }

      if (contractStatus !== undefined) {
        await this.studentContractsService.update(currentContract.id, {
          status: contractStatus,
        });
      }

      const normalizedDiscount =
        discountPercentage !== undefined
          ? normalizeDiscount(discountPercentage)
          : undefined;

      const planChanged =
        planId !== undefined && planId !== currentContract.plan.id;
      const discountChanged =
        normalizedDiscount !== undefined &&
        normalizedDiscount !== currentContract.discountPercentage;

      if (planChanged || discountChanged) {
        const targetPlan = {
          planId: planId ?? currentContract.plan.id,
          discountPercentage:
            normalizedDiscount !== undefined
              ? normalizedDiscount
              : currentContract.discountPercentage,
        };

        /*
         * A troca nunca é imediata: fica agendada e só se efetiva quando o
         * admin confirmar o pagamento da mensalidade do mês
         * (StudentsService.updatePayment()). Assim o mês em que a troca foi
         * pedida é sempre cobrado pelo plano antigo.
         */
        await this.studentContractsService.schedulePlanChange(
          currentContract.id,
          targetPlan,
        );
      } else if (currentContract.pendingPlan) {
        /*
         * Plano/desconto enviados batem com o que já está no contrato: o
         * admin desistiu da troca agendada e voltou pro valor atual.
         */
        await this.studentContractsService.clearPendingPlanChange(
          currentContract.id,
        );
      }
    }

    if (guardian !== undefined) {
      const pickedGuardian = this.pickGuardian(student.guardians);

      if (!pickedGuardian) {
        throw new BadRequestException(
          'Aluno não possui responsável cadastrado',
        );
      }

      await this.guardiansService.update(pickedGuardian.id, guardian);
    }

    return await this.findById(id);
  }

  /*
   * Plano do aluno autenticado (userId = sub do token): retorna todos os dados
   * do plano do contrato mais recente do aluno (tipo, preços, frequência,
   * região, ...) junto com o contexto do contrato (status, vigência e desconto
   * aplicado). O que o aluno paga é a mensalidade do plano contratado —
   * hourPrice acompanha como referência, e é o preço real só na avulsa. Lança
   * 404 se o aluno não existir ou não tiver nenhum contrato.
   */
  public async findStudentPlan(userId: string): Promise<StudentPlanDto> {
    const student = await this.findStudentByUserId(userId, {
      user: true,
      contracts: { plan: { region: true } },
    });

    const contract = this.pickCurrentContract(student.contracts);

    if (!contract) {
      throw new NotFoundException('Aluno não possui um plano contratado');
    }

    const { plan } = contract;

    return {
      studentId: student.id,
      studentName: student.user.name,
      planType: plan.planType,
      frequency: plan.frequency,
      monthlyPrice: monthlyAmount(plan, contract.discountPercentage),
      hourPrice: plan.hourPrice,
      classesCount: plan.classesCount,
      validityMonths: plan.validityMonths,
      region: plan.region.name,
      contractId: contract.id,
      contractStatus: contract.status,
      startDate: contract.startDate,
      endDate: contract.endDate,
      discountPercentage: contract.discountPercentage,
    };
  }

  /*
   * Outros planos disponíveis para o aluno autenticado: os principais dados dos
   * planos da região do aluno, exceto o plano do seu contrato atual. Se o aluno
   * não tiver contrato, retorna todos os planos da região. Ordenados pela
   * mensalidade (crescente), que é o que o aluno de fato paga.
   */
  public async findOtherPlans(userId: string): Promise<PlanSummaryDto[]> {
    const student = await this.findStudentByUserId(userId, {
      region: true,
      contracts: { plan: true },
    });

    const currentPlanId = this.pickCurrentContract(student.contracts)?.plan.id;

    const plans = await this.planRepository.find({
      where: { region: { id: student.region.id } },
      order: { monthlyPrice: 'ASC' },
    });

    return plans
      .filter((plan) => plan.id !== currentPlanId)
      .map((plan) => ({
        planType: plan.planType,
        frequency: plan.frequency,
        monthlyPrice: plan.monthlyPrice,
        hourPrice: plan.hourPrice,
        classesCount: plan.classesCount,
        validityMonths: plan.validityMonths,
      }));
  }

  /*
   * Histórico de pagamentos do aluno autenticado (userId = sub do token):
   * todas as parcelas de todos os contratos do aluno, com vencimento, data de
   * pagamento e status, junto com o tipo do plano do contrato de cada parcela.
   * Ordenado pelo vencimento (mais recente primeiro). Lança 404 se o aluno não
   * existir. Sobre de onde sai o valor de cada parcela, ver toPaymentDto.
   */
  public async findPaymentHistory(
    userId: string,
  ): Promise<PaymentHistoryDto[]> {
    const student = await this.findStudentByUserId(userId, {});

    return await this.findPaymentsByStudent(student.id);
  }

  /*
   * Mesmo histórico de parcelas, buscado pelo id do aluno — é o que o admin vê
   * no modal financeiro. `findPaymentHistory` é a versão pelo token do aluno.
   */
  public async findPaymentsByStudent(
    studentId: string,
  ): Promise<PaymentHistoryDto[]> {
    const payments = await this.paymentRepository.find({
      where: { studentContract: { student: { id: studentId } } },
      relations: { studentContract: { plan: true } },
      order: { dueDate: 'DESC' },
    });

    return await Promise.all(
      payments.map((payment) => this.toPaymentDto(payment)),
    );
  }

  /*
   * Troca o status de uma parcela — é como o admin fecha uma parcela depois que
   * o aluno paga. `paidAt` acompanha o status (pago = agora, qualquer outro =
   * nulo) em vez de vir do corpo: não existe registro retroativo hoje.
   * O `studentId` entra no filtro de propósito: sem ele, um paymentId solto
   * deixaria mexer na parcela de outro aluno.
   *
   * Quando a parcela PASSA a ser paga (não quando já estava): se o contrato
   * tinha uma troca de plano agendada, ela é efetivada agora — é exatamente
   * essa parcela que travava o replace(). Depois, gera a parcela do mês
   * seguinte (no contrato novo, se houve troca; no mesmo, se não houve).
   */
  public async updatePayment(
    studentId: string,
    paymentId: string,
    dto: UpdatePaymentDto,
  ): Promise<PaymentHistoryDto> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, studentContract: { student: { id: studentId } } },
      relations: { studentContract: { plan: true, pendingPlan: true } },
    });

    if (!payment) {
      throw new NotFoundException('Parcela não encontrada para este aluno');
    }

    const isNewlyPaid =
      dto.status === PaymentStatus.PAID &&
      payment.status !== PaymentStatus.PAID;

    payment.status = dto.status;
    payment.paidAt = dto.status === PaymentStatus.PAID ? nowNaive() : null;

    const saved = await this.paymentRepository.save(payment);

    if (isNewlyPaid) {
      const appliedContract = payment.studentContract.pendingPlan
        ? await this.studentContractsService.applyPendingPlanChange(
            payment.studentContract.id,
          )
        : null;

      await this.createNextPayment(
        appliedContract ?? payment.studentContract,
        payment.dueDate,
      );
    }

    return await this.toPaymentDto(saved);
  }

  /*
   * Parcela do mês seguinte, no dia equivalente ao vencimento pago (ver
   * addMonthsToDate), já com a mensalidade do plano. Não cria em contrato
   * cancelado, nem duplica um vencimento que já exista — o contrato recém
   * trocado pode ter nascido com essa mesma parcela
   * (StudentContractsService.createFirstPayment).
   *
   * O calendário para no fim do contrato: o Ouro e o Prata vão até dezembro, e
   * o Bronze é um pacote de parcela única — pago o pacote, não há próxima.
   *
   * Precisa de `contract.plan` carregado.
   */
  private async createNextPayment(
    contract: StudentContractEntity,
    paidDueDate: string,
  ): Promise<void> {
    if (
      contract.status === ContractStatus.CANCELLED ||
      contract.plan.planType === PlanType.BRONZE
    ) {
      return;
    }

    const nextDueDate = addMonthsToDate(paidDueDate, 1);

    if (contract.endDate && nextDueDate > contract.endDate) {
      return;
    }

    const existing = await this.paymentRepository.findOne({
      where: { studentContract: { id: contract.id }, dueDate: nextDueDate },
    });

    if (existing) {
      return;
    }

    await this.paymentRepository.save(
      this.paymentRepository.create({
        studentContract: contract,
        amount: monthlyAmount(contract.plan, contract.discountPercentage),
        dueDate: nextDueDate,
        paidAt: null,
        status: PaymentStatus.PENDING,
      }),
    );
  }

  /*
   * Precisa de `studentContract.plan` carregado.
   *
   * O valor da parcela é a mensalidade congelada em `payments.amount` quando
   * ela foi gerada — o aluno paga o plano, não as aulas. A avulsa é a exceção:
   * não tem mensalidade, então o valor é apurado aqui somando as aulas
   * faturáveis do mês. Apurar na leitura (em vez de somar na parcela ao
   * encerrar a aula) é o que faz `ClassesService.reopen()` se acertar sozinho.
   *
   * `classesCount` vale para os dois casos, mas é informativo nos planos
   * mensais: diz quantas aulas o aluno usou, não o que ele deve.
   */
  private async toPaymentDto(
    payment: PaymentEntity,
  ): Promise<PaymentHistoryDto> {
    const { plan } = payment.studentContract;
    const { amount, classesCount } = await this.sumBillableClasses(
      payment.studentContract.id,
      payment.dueDate,
    );

    return {
      id: payment.id,
      contractId: payment.studentContract.id,
      amount:
        plan.planType === PlanType.AVULSA
          ? amount
          : money(Number(payment.amount)),
      dueDate: payment.dueDate,
      paidAt: payment.paidAt,
      status: payment.status,
      planType: payment.studentContract.plan.planType,
      classesCount,
    };
  }

  /*
   * Soma o valor cobrado (amount_charged) e conta as aulas faturáveis de um
   * contrato cujo scheduled_at cai no mês da competência (dueDate). A soma só
   * tem valor na avulsa — nos planos mensais o amount_charged é nulo, porque a
   * aula não é cobrada; ali o que importa é a contagem.
   */
  private async sumBillableClasses(
    contractId: string,
    dueDate: string,
  ): Promise<{ amount: string; classesCount: number }> {
    const [year, monthNumber] = dueDate.split('-').map(Number);
    const { start, end } = getMonthRange(year, monthNumber);

    const result = await this.classRepository
      .createQueryBuilder('class')
      .where('class.student_contract_id = :contractId', { contractId })
      .andWhere('class.status IN (:...billable)', {
        billable: BILLABLE_STATUSES,
      })
      .andWhere('class.scheduledAt BETWEEN :start AND :end', { start, end })
      .select('COALESCE(SUM(class.amount_charged), 0)', 'amount')
      .addSelect('COUNT(class.id)', 'classesCount')
      .getRawOne<{ amount: string; classesCount: string }>();

    return {
      amount: money(Number(result?.amount ?? 0)),
      classesCount: Number(result?.classesCount ?? 0),
    };
  }

  /* Busca o aluno pelo id do usuário (sub do token). Lança 404 se não existir. */
  private async findStudentByUserId(
    userId: string,
    relations: FindOptionsRelations<StudentEntity>,
  ): Promise<StudentEntity> {
    const student = await this.studentRepository.findOne({
      where: { user: { id: userId } },
      relations,
    });

    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }

    return student;
  }

  /* Responsável financeiro, com fallback para o primeiro responsável. */
  private pickGuardian(guardians: GuardianEntity[]): GuardianEntity | null {
    return (
      guardians.find((g) => g.isFinancialResponsible) ?? guardians[0] ?? null
    );
  }

  /* Contrato mais recente do aluno — ver byMostRecent. */
  private pickCurrentContract(
    contracts: StudentContractEntity[],
  ): StudentContractEntity | null {
    return [...contracts].sort(byMostRecent)[0] ?? null;
  }
}
