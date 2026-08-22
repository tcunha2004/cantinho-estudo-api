import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { CompactStudentDto } from './dto/compact-student.dto';
import { StudentPlanDto } from './dto/student-plan.dto';
import { PlanSummaryDto } from './dto/plan-summary.dto';
import { PaymentHistoryDto } from './dto/payment-history.dto';
import { StudentDetailDto } from './dto/student-detail.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
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
  @Get('all')
  public async findAll(): Promise<CompactStudentDto[]> {
    return await this.studentsService.findAll();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('active')
  public async findAllActive(): Promise<CompactStudentDto[]> {
    return await this.studentsService.findAllActive();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get(':id')
  public async findById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentDetailDto> {
    return await this.studentsService.findById(id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id')
  public async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentDetailDto> {
    return await this.studentsService.update(id, dto);
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

  /*
   * Histórico financeiro de um aluno para o admin. Precisa vir depois de
   * `me/payments`: declarado antes, o `:id` casaria com "me" e o portal do
   * aluno quebraria com 400 no ParseUUIDPipe.
   */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get(':id/payments')
  public async findPaymentsByStudent(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentHistoryDto[]> {
    return await this.studentsService.findPaymentsByStudent(id);
  }

  /* Fecha (ou reabre) uma parcela do aluno. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/payments/:paymentId')
  public async updatePayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() dto: UpdatePaymentDto,
  ): Promise<PaymentHistoryDto> {
    return await this.studentsService.updatePayment(id, paymentId, dto);
  }
}
