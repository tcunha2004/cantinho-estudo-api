import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ClassEntity } from './entity/class.entity';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classRepository: Repository<ClassEntity>,
  ) {}

  public async countCurrentWeek(): Promise<number> {
    const { start, end } = this.getCurrentWeekRange();

    return await this.classRepository.count({
      where: { scheduledAt: Between(start, end) },
    });
  }

  /* Retorna o intervalo da semana atual: domingo 00:00:00 até sábado 23:59:59.999 */
  private getCurrentWeekRange(): { start: string; end: string } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = domingo, 1 = segunda, ... 6 = sábado

    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start: start.toISOString(), end: end.toISOString() };
  }
}
