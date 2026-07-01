import { Controller, Get, Query } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { TeacherEarningsQueryDto } from './dto/teacher-earnings-query.dto';
import { TeachersEarningsSummaryDto } from './dto/teachers-earnings-summary.dto';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  @Get('all/monthly-earnings')
  public async getAllTeachersEarningsByMonth(
    @Query() query: TeacherEarningsQueryDto,
  ): Promise<TeachersEarningsSummaryDto> {
    return await this.teachersService.getAllTeachersEarningsByMonth(
      query.month,
    );
  }
}
