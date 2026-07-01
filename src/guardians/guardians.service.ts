import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuardianEntity } from './entity/guardian.entity';
import { CreateGuardianDto } from './dto/create-guardian.dto';

@Injectable()
export class GuardiansService {
  constructor(
    @InjectRepository(GuardianEntity)
    private readonly guardianRepository: Repository<GuardianEntity>,
  ) {}

  public async create(
    studentId: string,
    data: CreateGuardianDto,
  ): Promise<GuardianEntity> {
    const guardian = this.guardianRepository.create({
      ...data,
      student: { id: studentId },
    });
    return await this.guardianRepository.save(guardian);
  }

  /* Persiste todos os responsáveis de um aluno (ex.: no momento do contrato) */
  public async createManyForStudent(
    studentId: string,
    data: CreateGuardianDto[],
  ): Promise<GuardianEntity[]> {
    const guardians = data.map((item) =>
      this.guardianRepository.create({ ...item, student: { id: studentId } }),
    );
    return await this.guardianRepository.save(guardians);
  }

  public async findByStudent(studentId: string): Promise<GuardianEntity[]> {
    return await this.guardianRepository.find({
      where: { student: { id: studentId } },
    });
  }
}
