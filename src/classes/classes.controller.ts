import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { ClassEntity } from './entity/class.entity';
import { MonthQueryDto } from '../common/dto/month-query.dto';
import { WeeklyClassCountDto } from './dto/weekly-class-count.dto';
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

  @UseGuards(AuthGuard)
  @Get('teacher/recent-history')
  public async getRecentHistoryByTeacher(
    @Req() request: RequestWithUser,
  ): Promise<ClassEntity[]> {
    return await this.classesService.getRecentHistoryByTeacher(
      request.user.sub,
    );
  }

  @UseGuards(AuthGuard)
  @Get('teacher/monthly-count')
  public async countMonthlyByTeacher(
    @Req() request: RequestWithUser,
    @Query() query: MonthQueryDto,
  ): Promise<{ count: number }> {
    const count = await this.classesService.countMonthlyByTeacher(
      request.user.sub,
      query.month,
    );
    return { count };
  }

  @UseGuards(AuthGuard)
  @Get('teacher/monthly-earnings')
  public async sumMonthlyEarningsByTeacher(
    @Req() request: RequestWithUser,
    @Query() query: MonthQueryDto,
  ): Promise<{ amountToReceive: number }> {
    const amountToReceive =
      await this.classesService.sumMonthlyEarningsByTeacher(
        request.user.sub,
        query.month,
      );
    return { amountToReceive };
  }

  @UseGuards(AuthGuard)
  @Get('teacher/weekly-count')
  public async countWeeklyByTeacher(
    @Req() request: RequestWithUser,
    @Query() query: MonthQueryDto,
  ): Promise<WeeklyClassCountDto[]> {
    return await this.classesService.countWeeklyByTeacher(
      request.user.sub,
      query.month,
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
