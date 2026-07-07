import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { StudentsService } from './students.service';
import { ActiveStudentDto } from './dto/active-student.dto';
import { StudentPlanDto } from './dto/student-plan.dto';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('active/count')
  public async countActive(): Promise<{ count: number }> {
    const count = await this.studentsService.countActive();
    return { count };
  }

  @Get('active')
  public async findAllActive(): Promise<ActiveStudentDto[]> {
    return await this.studentsService.findAllActive();
  }

  @Get(':id/plan')
  public async findStudentPlan(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentPlanDto> {
    return await this.studentsService.findStudentPlan(id);
  }
}
