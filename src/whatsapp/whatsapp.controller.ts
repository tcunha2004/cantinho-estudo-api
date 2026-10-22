import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappStatusDto } from './dto/whatsapp-status.dto';
import {
  WhatsappFailureDto,
  WhatsappResendResultDto,
} from './dto/whatsapp-failure.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  /* Alimenta a faixa do painel e a página de conexão (`fresh` ignora o cache). */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('status')
  public async status(
    @Query('fresh') fresh?: string,
  ): Promise<WhatsappStatusDto> {
    return await this.whatsappService.getStatus({ fresh: fresh === 'true' });
  }

  /* Cria a instância se preciso e devolve o QR code para ler no celular. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Post('connect')
  public async connect(): Promise<WhatsappStatusDto> {
    return await this.whatsappService.connect();
  }

  /* Encerra a sessão do WhatsApp; a instância continua para reconectar. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Post('disconnect')
  public async disconnect(): Promise<WhatsappStatusDto> {
    return await this.whatsappService.disconnect();
  }

  /* Mensagens que falharam ou ficaram pela metade, para reenviar ou descartar. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get('messages/failures')
  public async failures(): Promise<WhatsappFailureDto[]> {
    return await this.whatsappService.listFailures();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Post('messages/:id/resend')
  public async resend(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WhatsappResendResultDto> {
    return await this.whatsappService.resend(id);
  }

  /* Tira a falha da lista sem enviar nada. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Patch('messages/:id/discard')
  public async discard(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.whatsappService.discard(id);
  }
}
