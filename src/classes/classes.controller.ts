import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { ClassEntity } from './entity/class.entity';
import { MonthQueryDto } from '../common/dto/month-query.dto';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import type { RequestWithUser } from 'src/auth/guard/auth.guard';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get('today/upcoming')
  public async getUpcomingClassesToday(): Promise<ClassEntity[]> {
    return await this.classesService.getUpcomingClassesToday();
  }

  @UseGuards(AuthGuard)
  @Get('teacher/upcoming')
  public async getUpcomingClassesByTeacher(
    @Req() request: RequestWithUser,
  ): Promise<ClassEntity[]> {
    return await this.classesService.getUpcomingClassesByTeacher(
      request.user.sub,
    );
  }

  @Get('current-week/count')
  public async countCurrentWeek(): Promise<{ count: number }> {
    const count = await this.classesService.countCurrentWeek();
    return { count };
  }

  @Get('current-month/revenue')
  public async getCurrentMonthRevenue(): Promise<{ revenue: number }> {
    const revenue = await this.classesService.getCurrentMonthRevenue();
    return { revenue };
  }

  @Get('monthly-revenue')
  public async getMonthlyRevenue(
    @Query() query: MonthQueryDto,
  ): Promise<{ revenue: number }> {
    const revenue = await this.classesService.getMonthlyRevenue(query.month);
    return { revenue };
  }
}
