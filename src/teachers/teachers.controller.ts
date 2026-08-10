import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { MonthQueryDto } from '../common/dto/month-query.dto';
import { TeachersEarningsSummaryDto } from './dto/teachers-earnings-summary.dto';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  /* Comissão de todos os professores — folha de pagamento, só para o admin. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('all/monthly-earnings')
  public async getAllTeachersEarningsByMonth(
    @Query() query: MonthQueryDto,
  ): Promise<TeachersEarningsSummaryDto> {
    return await this.teachersService.getAllTeachersEarningsByMonth(
      query.month,
    );
  }
}
