import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { StudentsService } from './students.service';
import { ActiveStudentDto } from './dto/active-student.dto';
import { StudentPlanDto } from './dto/student-plan.dto';
import { PlanSummaryDto } from './dto/plan-summary.dto';
import { PaymentHistoryDto } from './dto/payment-history.dto';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import type { RequestWithUser } from 'src/auth/guard/auth.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';

@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  /* Dados cadastrais e financeiros da base de alunos — só o admin enxerga. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('active/count')
  public async countActive(): Promise<{ count: number }> {
    const count = await this.studentsService.countActive();
    return { count };
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
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

  @UseGuards(AuthGuard)
  @Get('me/payments')
  public async findPaymentHistory(
    @Req() request: RequestWithUser,
  ): Promise<PaymentHistoryDto[]> {
    return await this.studentsService.findPaymentHistory(request.user.sub);
  }
}
