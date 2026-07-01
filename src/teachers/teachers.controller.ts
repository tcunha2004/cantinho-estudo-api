import { Controller, Get, Query } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { MonthQueryDto } from '../common/dto/month-query.dto';
import { TeachersEarningsSummaryDto } from './dto/teachers-earnings-summary.dto';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('all/monthly-earnings')
  public async getAllTeachersEarningsByMonth(
    @Query() query: MonthQueryDto,
  ): Promise<TeachersEarningsSummaryDto> {
    return await this.teachersService.getAllTeachersEarningsByMonth(
      query.month,
    );
  }
}
