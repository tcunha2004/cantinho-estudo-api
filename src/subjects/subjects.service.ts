import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubjectEntity } from './entity/subject.entity';
import { SubjectDto } from './dto/subject.dto';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjectRepository: Repository<SubjectEntity>,
  ) {}

  /* Todas as matérias do sistema — usado pro admin escolher o que um professor leciona. */
  public async findAll(): Promise<SubjectDto[]> {
    const subjects = await this.subjectRepository.find({
      order: { name: 'ASC' },
    });

    return subjects.map((subject) => ({ id: subject.id, name: subject.name }));
  }
}
