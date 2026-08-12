import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { ClassEntity } from './entity/class.entity';
import { MonthQueryDto } from '../common/dto/month-query.dto';
import { WeeklyClassCountDto } from './dto/weekly-class-count.dto';
import { AgendaQueryDto } from './dto/agenda-query.dto';
import { AgendaClassDto } from './dto/agenda-class.dto';
import { ClassDetailDto } from './dto/class-detail.dto';
import { ClassFormOptionsDto } from './dto/class-form-options.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import type { RequestWithUser } from 'src/auth/guard/auth.guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/auth/decorator/roles.decorator';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  /* Agregações do painel administrativo — dados de toda a escola, só admin. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
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

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('current-week/count')
  public async countCurrentWeek(): Promise<{ count: number }> {
    const count = await this.classesService.countCurrentWeek();
    return { count };
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('current-month/revenue')
  public async getCurrentMonthRevenue(): Promise<{ revenue: number }> {
    const revenue = await this.classesService.getCurrentMonthRevenue();
    return { revenue };
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('monthly-revenue')
  public async getMonthlyRevenue(
    @Query() query: MonthQueryDto,
  ): Promise<{ revenue: number }> {
    const revenue = await this.classesService.getMonthlyRevenue(query.month);
    return { revenue };
  }

  /* Grade da agenda: um intervalo de dias, escopado pelo papel de quem pediu. */
  @UseGuards(AuthGuard)
  @Get('agenda')
  public async findAgenda(
    @Req() request: RequestWithUser,
    @Query() query: AgendaQueryDto,
  ): Promise<AgendaClassDto[]> {
    return await this.classesService.findAgenda(request.user, query);
  }

  /* Opções dos selects do formulário de aula. Alunos não agendam, então não entram. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'professor')
  @Get('form-options')
  public async findFormOptions(
    @Req() request: RequestWithUser,
  ): Promise<ClassFormOptionsDto> {
    return await this.classesService.findFormOptions(request.user);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'professor')
  @Post()
  public async create(
    @Req() request: RequestWithUser,
    @Body() body: CreateClassDto,
  ): Promise<ClassDetailDto> {
    return await this.classesService.create(request.user, body);
  }

  /* Conclui a aula e congela região, comissão e valor cobrado. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'professor')
  @Patch(':id/complete')
  public async complete(
    @Req() request: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClassDetailDto> {
    return await this.classesService.complete(request.user, id);
  }

  /* Falta sem aviso: encerra e congela os valores igual a uma aula realizada. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'professor')
  @Patch(':id/no-show')
  public async markNoShow(
    @Req() request: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClassDetailDto> {
    return await this.classesService.markNoShow(request.user, id);
  }

  /* Desfaz um encerramento. Só admin: descongela receita e comissão. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/reopen')
  public async reopen(
    @Req() request: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClassDetailDto> {
    return await this.classesService.reopen(request.user, id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'professor')
  @Patch(':id/cancel')
  public async cancel(
    @Req() request: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClassDetailDto> {
    return await this.classesService.cancel(request.user, id);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin', 'professor')
  @Patch(':id')
  public async update(
    @Req() request: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateClassDto,
  ): Promise<ClassDetailDto> {
    return await this.classesService.update(request.user, id, body);
  }

  /*
   * Precisa ficar por último: como rota curinga, declarada antes engoliria
   * `agenda`, `form-options` e todas as demais rotas literais acima.
   */
  @UseGuards(AuthGuard)
  @Get(':id')
  public async findById(
    @Req() request: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClassDetailDto> {
    return await this.classesService.findById(request.user, id);
  }
}
