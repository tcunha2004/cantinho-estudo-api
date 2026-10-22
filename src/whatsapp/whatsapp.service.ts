import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappInstanceEntity } from './entity/whatsapp-instance.entity';
import { WhatsappState, WhatsappStatusDto } from './dto/whatsapp-status.dto';
import { UazapiClient, UazapiError } from './uazapi.client';

export const INSTANCE_NAME = 'cantinho-estudo';
export const STATUS_CACHE_MS = 30_000;

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
  private cache: { at: number; value: WhatsappStatusDto } | null = null;

  constructor(
    @InjectRepository(WhatsappInstanceEntity)
    private readonly instanceRepository: Repository<WhatsappInstanceEntity>,
    private readonly client: UazapiClient,
  ) {}

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
