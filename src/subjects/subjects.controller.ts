import { Controller, Get, UseGuards } from '@nestjs/common';
import { SubjectsService } from './subjects.service';
import { SubjectDto } from './dto/subject.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  /* Lista mestra de matérias — só o admin usa, pra editar as de um professor. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get()
  public async findAll(): Promise<SubjectDto[]> {
    return await this.subjectsService.findAll();
  }
}
