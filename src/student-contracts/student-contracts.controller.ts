import { Controller, Get, UseGuards } from '@nestjs/common';
import { StudentContractsService } from './student-contracts.service';
import { PlanType } from '../plans/enums/plan-type.enum';
import { AuthGuard } from '../auth/guard/auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';

@Controller('student-contracts')
export class StudentContractsController {
  constructor(
    private readonly studentContractsService: StudentContractsService,
  ) {}

  /* Distribuição de planos da escola inteira — painel do admin. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('active/count-by-plan-type')
  public async countActiveByPlanType(): Promise<Record<PlanType, number>> {
    return await this.studentContractsService.countActiveByPlanType();
  }
}
