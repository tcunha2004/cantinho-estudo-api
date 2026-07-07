import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { StudentsService } from './students.service';
import { ActiveStudentDto } from './dto/active-student.dto';
import { StudentPlanDto } from './dto/student-plan.dto';
import { PlanSummaryDto } from './dto/plan-summary.dto';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import type { RequestWithUser } from 'src/auth/guard/auth.guard';

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

  @UseGuards(AuthGuard)
  @Get('me/plan')
  public async findStudentPlan(
    @Req() request: RequestWithUser,
  ): Promise<StudentPlanDto> {
    return await this.studentsService.findStudentPlan(request.user.sub);
  }

  @UseGuards(AuthGuard)
  @Get('me/other-plans')
  public async findOtherPlans(
    @Req() request: RequestWithUser,
  ): Promise<PlanSummaryDto[]> {
    return await this.studentsService.findOtherPlans(request.user.sub);
  }
}
