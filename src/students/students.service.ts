import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsRelations, Repository } from 'typeorm';
import { StudentEntity } from './entity/student.entity';
import { StudentContractEntity } from '../student-contracts/entity/student-contract.entity';
import { GuardianEntity } from '../guardians/entity/guardian.entity';
import { PlanEntity } from '../plans/entity/plan.entity';
import { PaymentEntity } from '../payments/entity/payment.entity';
import { ActiveStudentDto } from './dto/active-student.dto';
import { StudentPlanDto } from './dto/student-plan.dto';
import { PlanSummaryDto } from './dto/plan-summary.dto';
import { PaymentHistoryDto } from './dto/payment-history.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepository: Repository<PlanEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepository: Repository<PaymentEntity>,
  ) {}

  public async countActive(): Promise<number> {
    return await this.studentRepository.count({ where: { active: true } });
  }

  public async findAllActive(): Promise<ActiveStudentDto[]> {
    const students = await this.studentRepository.find({
      where: { active: true },
      relations: { user: true, guardians: true, contracts: { plan: true } },
    });

    return students
      .map((student) => {
        const guardian = this.pickGuardian(student.guardians);
        const contract = this.pickCurrentContract(student.contracts);

        return {
          id: student.id,
          name: student.user.name,
          guardian: guardian?.name ?? null,
          plan: contract?.plan.planType ?? null,
          frequency: contract?.plan.frequency ?? null,
          monthlyPrice: contract?.plan.monthlyPrice ?? null,
          contractStatus: contract?.status ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /*
   * Plano do aluno autenticado (userId = sub do token): retorna todos os dados
   * do plano do contrato mais recente do aluno (tipo, preços, frequência,
   * região, ...) junto com o contexto do contrato (status, vigência e desconto
   * aplicado). Lança 404 se o aluno não existir ou não tiver nenhum contrato.
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
      monthlyPrice: plan.monthlyPrice,
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
   * não tiver contrato, retorna todos os planos da região. Ordenados pelo preço
   * mensal (crescente).
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
   * todas as parcelas de todos os contratos do aluno, com valor, vencimento,
   * data de pagamento e status, junto com o tipo do plano do contrato de cada
   * parcela. Ordenado pelo vencimento (mais recente primeiro). Lança 404 se o
   * aluno não existir.
   */
  public async findPaymentHistory(
    userId: string,
  ): Promise<PaymentHistoryDto[]> {
    const student = await this.findStudentByUserId(userId, {});

    const payments = await this.paymentRepository.find({
      where: { studentContract: { student: { id: student.id } } },
      relations: { studentContract: { plan: true } },
      order: { dueDate: 'DESC' },
    });

    return payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      dueDate: payment.dueDate,
      paidAt: payment.paidAt,
      status: payment.status,
      planType: payment.studentContract.plan.planType,
    }));
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

  /* Contrato mais recente do aluno (pela data de início). */
  private pickCurrentContract(
    contracts: StudentContractEntity[],
  ): StudentContractEntity | null {
    return (
      [...contracts].sort((a, b) =>
        b.startDate.localeCompare(a.startDate),
      )[0] ?? null
    );
  }
}
