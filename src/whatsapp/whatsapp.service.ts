import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Raw, Repository } from 'typeorm';
import { WhatsappInstanceEntity } from './entity/whatsapp-instance.entity';
import { WhatsappMessageEntity } from './entity/whatsapp-message.entity';
import { WhatsappMessageStatus } from './enums/whatsapp-message-status.enum';
import {
  WhatsappFailureDto,
  WhatsappResendResultDto,
} from './dto/whatsapp-failure.dto';
import {
  resolveAppUrl,
  signupApprovedText,
  toWhatsappNumber,
} from './whatsapp-text';
import { WhatsappState, WhatsappStatusDto } from './dto/whatsapp-status.dto';
import { UazapiClient, UazapiError } from './uazapi.client';

export const INSTANCE_NAME = 'cantinho-estudo';
export const STATUS_CACHE_MS = 30_000;

const SIGNUP_APPROVED = 'signup_approved';

/* `pending` parado há mais de 5 min: o processo caiu no meio do envio. O
 * corte é feito no SQL para não misturar o relógio da aplicação com o do banco. */
const STALE = Raw((column) => `${column} < now() - interval '5 minutes'`);
const RETRYABLE = (
  extra: FindOptionsWhere<WhatsappMessageEntity> = {},
): FindOptionsWhere<WhatsappMessageEntity>[] => [
  { ...extra, status: WhatsappMessageStatus.FAILED },
  { ...extra, status: WhatsappMessageStatus.PENDING, createdAt: STALE },
];

const status = (
  state: WhatsappState,
  extra: Partial<WhatsappStatusDto> = {},
): WhatsappStatusDto => ({
  state,
  qrcode: null,
  phone: null,
  profileName: null,
  ...extra,
});

/*
 * Cuida do WhatsApp do admin: uma instância só, traduz os estados da UAZAPI
 * para os do sistema e guarda o status em cache para o painel poder
 * consultar a cada navegação sem martelar a UAZAPI.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly appUrl: string;
  private cache: { at: number; value: WhatsappStatusDto } | null = null;

  constructor(
    @InjectRepository(WhatsappInstanceEntity)
    private readonly instanceRepository: Repository<WhatsappInstanceEntity>,
    private readonly client: UazapiClient,
    @InjectRepository(WhatsappMessageEntity)
    private readonly messageRepository: Repository<WhatsappMessageEntity>,
    config: ConfigService,
  ) {
    /* Falha aqui de propósito: sem APP_URL a API não sobe. */
    this.appUrl = resolveAppUrl(config);
  }

  /* `fresh` ignora o cache — usado pela página de conexão, que faz polling. */
  public async getStatus(
    options: { fresh?: boolean } = {},
  ): Promise<WhatsappStatusDto> {
    if (
      !options.fresh &&
      this.cache &&
      Date.now() - this.cache.at < STATUS_CACHE_MS
    ) {
      return this.cache.value;
    }
    const value = await this.fetchStatus();
    this.cache = { at: Date.now(), value };
    return value;
  }

  /* Cria a instância na primeira vez e pede o QR code à UAZAPI. */
  public async connect(): Promise<WhatsappStatusDto> {
    if (!this.client.isConfigured()) {
      throw new BadRequestException('WhatsApp não configurado no servidor');
    }
    this.cache = null;
    await this.viaUazapi(async () => {
      let instance = await this.findInstance();
      if (!instance) {
        const token = await this.client.createInstance(INSTANCE_NAME);
        instance = await this.instanceRepository.save(
          this.instanceRepository.create({ token }),
        );
      }
      await this.client.connect(instance.token);
    });
    return await this.getStatus({ fresh: true });
  }

  public async disconnect(): Promise<WhatsappStatusDto> {
    this.cache = null;
    const instance = await this.findInstance();
    if (instance) {
      await this.viaUazapi(() => this.client.disconnect(instance.token));
    }
    return await this.getStatus({ fresh: true });
  }

  /*
   * Nunca rejeita: quem chama é a aprovação do cadastro, que não pode falhar
   * nem esperar por causa do WhatsApp. Qualquer erro vira log; se a linha
   * `pending` chegou a ser gravada, ela reaparece como "interrompida".
   */
  public async notifySignupApproved(student: {
    id: string;
    name: string;
    phone: string;
  }): Promise<void> {
    try {
      const message = await this.messageRepository.save(
        this.messageRepository.create({
          kind: SIGNUP_APPROVED,
          phone: student.phone,
          text: signupApprovedText(student.name, this.appUrl),
          status: WhatsappMessageStatus.PENDING,
          student: { id: student.id },
        }),
      );
      await this.deliver(message);
    } catch (error) {
      this.logger.error(
        `Falha ao avisar o aluno ${student.id} por WhatsApp`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /* Falhas e envios interrompidos, os mais novos primeiro. */
  public async listFailures(): Promise<WhatsappFailureDto[]> {
    const messages = await this.messageRepository.find({
      where: RETRYABLE(),
      relations: { student: { user: true } },
      order: { createdAt: 'DESC' },
    });
    return messages.map((message) => ({
      id: message.id,
      studentName: message.student?.user.name ?? null,
      phone: message.phone,
      text: message.text,
      error:
        message.status === WhatsappMessageStatus.PENDING
          ? 'Envio interrompido'
          : (message.error ?? 'Falha no envio'),
      createdAt: message.createdAt,
    }));
  }

  /*
   * Reenvia o texto gravado para o telefone ATUAL do aluno (o cadastro pode
   * ter sido corrigido). Só vale para o que ainda é reenviável: um segundo
   * clique encontra a linha já `sent` e é recusado.
   */
  public async resend(id: string): Promise<WhatsappResendResultDto> {
    const message = await this.messageRepository.findOne({
      where: RETRYABLE({ id }),
      relations: { student: true },
    });
    if (!message) {
      throw new BadRequestException('Esta mensagem não pode ser reenviada');
    }
    if (message.student) message.phone = message.student.phone;
    const delivered = await this.deliver(message);
    return {
      id: delivered.id,
      status: delivered.status,
      error: delivered.error,
    };
  }

  public async discard(id: string): Promise<void> {
    const message = await this.messageRepository.findOne({
      where: RETRYABLE({ id }),
    });
    if (!message) {
      throw new BadRequestException('Esta mensagem não pode ser descartada');
    }
    await this.messageRepository.update(id, {
      status: WhatsappMessageStatus.DISCARDED,
    });
  }

  /* Tenta o envio e grava o resultado na linha, que sempre é salva. */
  private async deliver(
    message: WhatsappMessageEntity,
  ): Promise<WhatsappMessageEntity> {
    const failure = await this.send(message);
    message.status = failure
      ? WhatsappMessageStatus.FAILED
      : WhatsappMessageStatus.SENT;
    message.error = failure;
    return await this.messageRepository.save(message);
  }

  /* Devolve o motivo da falha, ou null se a UAZAPI aceitou a mensagem. */
  private async send(message: WhatsappMessageEntity): Promise<string | null> {
    const number = toWhatsappNumber(message.phone);
    if (!number) return 'Telefone inválido';
    const instance = this.client.isConfigured()
      ? await this.findInstance()
      : null;
    if (!instance) return 'WhatsApp não conectado';
    try {
      await this.client.sendText(instance.token, number, message.text);
      return null;
    } catch (error) {
      if (error instanceof UazapiError) return error.message;
      throw error;
    }
  }

  private async fetchStatus(): Promise<WhatsappStatusDto> {
    if (!this.client.isConfigured()) return status('not_configured');
    const instance = await this.findInstance();
    if (!instance) return status('disconnected');

    try {
      const remote = await this.client.getStatus(instance.token);
      switch (remote.status) {
        case 'connected':
          return status('connected', {
            phone: remote.phone,
            profileName: remote.profileName,
          });
        case 'connecting':
          return status('connecting', { qrcode: remote.qrcode });
        default:
          return status('disconnected');
      }
    } catch (error) {
      /* Instância apagada do lado da UAZAPI: sem isso a tela ficaria presa. */
      if (
        error instanceof UazapiError &&
        (error.httpStatus === 401 || error.httpStatus === 404)
      ) {
        await this.instanceRepository.delete(instance.id);
        return status('disconnected');
      }
      return status('unreachable');
    }
  }

  private async findInstance(): Promise<WhatsappInstanceEntity | null> {
    return await this.instanceRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });
  }

  /* Erro da UAZAPI chega ao admin como 503 com a mensagem dela. */
  private async viaUazapi(run: () => Promise<unknown>): Promise<void> {
    try {
      await run();
    } catch (error) {
      if (error instanceof UazapiError) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }
  }
}
