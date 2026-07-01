import { Controller, Get } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { ClassEntity } from './entity/class.entity';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get('today/upcoming')
  public async getUpcomingClassesToday(): Promise<ClassEntity[]> {
    return await this.classesService.getUpcomingClassesToday();
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
}
