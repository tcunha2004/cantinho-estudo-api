import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudentEntity } from './entity/student.entity';
import { StudentContractEntity } from '../student-contracts/entity/student-contract.entity';
import { GuardianEntity } from '../guardians/entity/guardian.entity';
import { ActiveStudentDto } from './dto/active-student.dto';
import { StudentPlanDto } from './dto/student-plan.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly studentRepository: Repository<StudentEntity>,
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
   * Plano de um aluno: retorna todos os dados do plano do contrato mais recente
   * do aluno (tipo, preços, frequência, região, ...) junto com o contexto do
   * contrato (status, vigência e desconto aplicado). Lança 404 se o aluno não
   * existir ou não tiver nenhum contrato.
   */
  public async findStudentPlan(studentId: string): Promise<StudentPlanDto> {
    const student = await this.studentRepository.findOne({
      where: { id: studentId },
      relations: { user: true, contracts: { plan: { region: true } } },
    });

    if (!student) {
      throw new NotFoundException('Aluno não encontrado');
    }

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
