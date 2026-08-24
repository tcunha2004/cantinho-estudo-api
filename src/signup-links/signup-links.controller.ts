import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SignupLinksService } from './signup-links.service';
import { SignupFormDto } from './dto/signup-form.dto';
import { WaitingSignupDto } from './dto/waiting-signup.dto';
import { UpdateSignupLinkDto } from './dto/update-signup-link.dto';
import { ApproveSignupDto } from './dto/approve-signup.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import type { RequestWithUser } from '../auth/guard/auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';

/*
 * Metade das rotas daqui é pública de propósito: quem preenche o formulário é
 * um aluno que ainda não existe no sistema, então não há sessão para exigir. O
 * segredo é o próprio id do link (uuid v4), que só quem recebeu o link conhece.
 */
@Controller('signup-links')
export class SignupLinksController {
  constructor(private readonly signupLinksService: SignupLinksService) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Post()
  public async create(
    @Req() request: RequestWithUser,
  ): Promise<{ id: string }> {
    return await this.signupLinksService.create(request.user.sub);
  }

  /* Alimenta o sino e o modal de notificações. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('waiting')
  public async findWaiting(): Promise<WaitingSignupDto[]> {
    return await this.signupLinksService.findWaiting();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Post(':id/approve')
  public async approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveSignupDto,
  ): Promise<{ studentId: string }> {
    return await this.signupLinksService.approve(id, dto);
  }

  /* Público — tela de cadastro do aluno. */
  @Get(':id/form')
  public async findForm(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SignupFormDto> {
    return await this.signupLinksService.findForm(id);
  }

  /* Público — salva a fase que o aluno acabou de preencher. */
  @Patch(':id')
  public async updateDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSignupLinkDto,
  ): Promise<void> {
    await this.signupLinksService.updateDraft(id, dto);
  }

  /* Público — envio do formulário completo. */
  @Post(':id/submit')
  public async submit(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.signupLinksService.submit(id);
  }
}
