import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type UazapiInstanceStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'hibernated';

export interface UazapiStatus {
  status: UazapiInstanceStatus;
  /* `instance.qrcode`; nulo quando vazio ou ausente. */
  qrcode: string | null;
  /* `status.jid.user`, ex. '5531999999999'. */
  phone: string | null;
  profileName: string | null;
}

/* `httpStatus` nulo = rede, timeout ou resposta ilegível. */
export class UazapiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

interface UazapiBody {
  message_ptbr?: string;
  error?: string;
  message?: string;
  instance?: {
    token?: string;
    status?: UazapiInstanceStatus;
    qrcode?: string;
    profileName?: string;
  };
  status?: { jid?: { user?: string } };
}

/*
 * Só HTTP: fala com a UAZAPI e traduz falha em UazapiError. Não sabe de
 * alunos nem de histórico de mensagens — isso é com o WhatsappService.
 */
@Injectable()
export class UazapiClient {
  constructor(private readonly config: ConfigService) {}

  public isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('UAZAPI_URL') &&
      this.config.get<string>('UAZAPI_ADMIN_TOKEN'),
    );
  }

  /* Devolve o token da instância nova. */
  public async createInstance(name: string): Promise<string> {
    const body = await this.request(
      '/instance/create',
      'POST',
      {
        admintoken: this.config.get<string>('UAZAPI_ADMIN_TOKEN') ?? '',
      },
      { name },
    );
    if (!body.instance?.token) {
      throw new UazapiError('A UAZAPI não devolveu o token da instância', null);
    }
    return body.instance.token;
  }

  /* 409 = pareamento já em andamento, que para nós é sucesso. */
  public async connect(token: string): Promise<void> {
    try {
      await this.request('/instance/connect', 'POST', { token }, {});
    } catch (error) {
      if (error instanceof UazapiError && error.httpStatus === 409) return;
      throw error;
    }
  }

  public async getStatus(token: string): Promise<UazapiStatus> {
    const body = await this.request('/instance/status', 'GET', { token });
    return {
      status: body.instance?.status ?? 'disconnected',
      qrcode: body.instance?.qrcode || null,
      phone: body.status?.jid?.user || null,
      profileName: body.instance?.profileName || null,
    };
  }

  public async disconnect(token: string): Promise<void> {
    await this.request('/instance/disconnect', 'POST', { token }, {});
  }

  public async sendText(
    token: string,
    number: string,
    text: string,
  ): Promise<void> {
    await this.request('/send/text', 'POST', { token }, { number, text });
  }

  /* Concentra fetch, timeout e a conversão de erro. */
  private async request(
    path: string,
    method: 'GET' | 'POST',
    headers: Record<string, string>,
    body?: object,
  ): Promise<UazapiBody> {
    const base = (this.config.get<string>('UAZAPI_URL') ?? '').replace(
      /\/$/,
      '',
    );
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new UazapiError('Não foi possível falar com a UAZAPI', null);
    }

    const json = (await response.json().catch(() => ({}))) as UazapiBody;
    if (!response.ok) {
      throw new UazapiError(
        json.message_ptbr ||
          json.error ||
          json.message ||
          `UAZAPI respondeu ${response.status}`,
        response.status,
      );
    }
    return json;
  }
}
