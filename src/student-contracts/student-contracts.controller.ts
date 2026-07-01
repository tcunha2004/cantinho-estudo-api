import { Controller, Get } from '@nestjs/common';
import { StudentContractsService } from './student-contracts.service';
import { PlanType } from '../plans/enums/plan-type.enum';

@Controller('student-contracts')
export class StudentContractsController {
  constructor(
    private readonly studentContractsService: StudentContractsService,
  ) {}

  @Get('active/count-by-plan-type')
  public async countActiveByPlanType(): Promise<Record<PlanType, number>> {
    return await this.studentContractsService.countActiveByPlanType();
  }
}
