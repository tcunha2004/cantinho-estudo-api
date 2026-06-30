import { Controller, Get } from '@nestjs/common';
import { ClassesService } from './classes.service';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get('current-week/count')
  public async countCurrentWeek(): Promise<{ count: number }> {
    const count = await this.classesService.countCurrentWeek();
    return { count };
  }
}
