import { UazapiClient } from './uazapi.client';

const config = {
  get: (key: string) =>
    ({ UAZAPI_URL: 'https://x.uazapi.com/', UAZAPI_ADMIN_TOKEN: 'adm' })[key],
};

const respond = (status: number, body: unknown) => ({
  ok: status < 300,
  status,
  json: async () => body,
});

describe('UazapiClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  const client = () => new UazapiClient(config as never);

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as never;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('isConfigured é falso sem URL ou admintoken', () => {
    expect(
      new UazapiClient({ get: () => undefined } as never).isConfigured(),
    ).toBe(false);
    expect(client().isConfigured()).toBe(true);
  });

  it('cria a instância com o admintoken e devolve o token dela', async () => {
    fetchMock.mockResolvedValue(respond(200, { instance: { token: 'tok-1' } }));
    await expect(client().createInstance('cantinho-estudo')).resolves.toBe(
      'tok-1',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.uazapi.com/instance/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ admintoken: 'adm' }),
        body: JSON.stringify({ name: 'cantinho-estudo' }),
      }),
    );
  });

  it('createInstance sem token na resposta falha em vez de gravar token vazio', async () => {
    fetchMock.mockResolvedValue(respond(200, { instance: {} }));
    await expect(client().createInstance('cantinho-estudo')).rejects.toEqual(
      expect.objectContaining({ httpStatus: null }),
    );
  });

  it('connect trata 409 (pareamento em andamento) como sucesso', async () => {
    fetchMock.mockResolvedValue(respond(409, { error: 'already connecting' }));
    await expect(client().connect('tok-1')).resolves.toBeUndefined();
  });

  it('lê estado, QR, número e perfil do status', async () => {
    fetchMock.mockResolvedValue(
      respond(200, {
        instance: { status: 'connected', qrcode: '', profileName: 'Cantinho' },
        status: { connected: true, jid: { user: '5531999999999' } },
      }),
    );
    await expect(client().getStatus('tok-1')).resolves.toEqual({
      status: 'connected',
      qrcode: null,
      phone: '5531999999999',
      profileName: 'Cantinho',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.uazapi.com/instance/status',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ token: 'tok-1' }),
      }),
    );
  });

  it('envia texto com number e text', async () => {
    fetchMock.mockResolvedValue(respond(200, {}));
    await client().sendText('tok-1', '5531999999999', 'oi');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://x.uazapi.com/send/text',
      expect.objectContaining({
        body: JSON.stringify({ number: '5531999999999', text: 'oi' }),
      }),
    );
  });

  it('erro HTTP vira UazapiError com o status e a mensagem em português', async () => {
    fetchMock.mockResolvedValue(
      respond(500, {
        error: 'x',
        message_ptbr: 'O servidor do WhatsApp recusou esta mensagem.',
      }),
    );
    await expect(client().sendText('tok-1', '55', 'oi')).rejects.toEqual(
      expect.objectContaining({
        httpStatus: 500,
        message: 'O servidor do WhatsApp recusou esta mensagem.',
      }),
    );
  });

  it('falha de rede vira UazapiError sem status', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client().getStatus('tok-1')).rejects.toEqual(
      expect.objectContaining({
        httpStatus: null,
        message: 'Não foi possível falar com a UAZAPI',
      }),
    );
  });
});
