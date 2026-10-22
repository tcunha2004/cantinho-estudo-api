import { ServiceUnavailableException } from '@nestjs/common';
import { UazapiError } from './uazapi.client';
import { WhatsappService } from './whatsapp.service';

describe('WhatsappService', () => {
  let instances: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  let client: {
    isConfigured: jest.Mock;
    createInstance: jest.Mock;
    connect: jest.Mock;
    getStatus: jest.Mock;
    disconnect: jest.Mock;
    sendText: jest.Mock;
  };
  let service: WhatsappService;

  const makeService = () => {
    instances = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn(async (d) => ({ id: 'i1', ...d })),
      create: jest.fn((d) => d),
      delete: jest.fn(),
    };
    client = {
      isConfigured: jest.fn().mockReturnValue(true),
      createInstance: jest.fn().mockResolvedValue('tok-1'),
      connect: jest.fn(),
      getStatus: jest.fn(),
      disconnect: jest.fn(),
      sendText: jest.fn(),
    };
    service = new WhatsappService(instances as never, client as never);
  };

  const withInstance = () =>
    instances.findOne.mockResolvedValue({ id: 'i1', token: 'tok-1' });

  beforeEach(makeService);
  afterEach(() => jest.useRealTimers());

  describe('getStatus', () => {
    it('not_configured sem as variáveis da UAZAPI', async () => {
      client.isConfigured.mockReturnValue(false);
      await expect(service.getStatus()).resolves.toEqual({
        state: 'not_configured',
        qrcode: null,
        phone: null,
        profileName: null,
      });
    });

    it('disconnected quando ainda não há instância', async () => {
      await expect(service.getStatus()).resolves.toMatchObject({
        state: 'disconnected',
      });
      expect(client.getStatus).not.toHaveBeenCalled();
    });

    it('connected traz número e perfil, sem QR', async () => {
      withInstance();
      client.getStatus.mockResolvedValue({
        status: 'connected',
        qrcode: 'qr',
        phone: '5531999999999',
        profileName: 'Cantinho',
      });
      await expect(service.getStatus()).resolves.toEqual({
        state: 'connected',
        qrcode: null,
        phone: '5531999999999',
        profileName: 'Cantinho',
      });
    });

    it('connecting traz o QR, sem número', async () => {
      withInstance();
      client.getStatus.mockResolvedValue({
        status: 'connecting',
        qrcode: 'data:image/png;base64,AAA',
        phone: null,
        profileName: null,
      });
      await expect(service.getStatus()).resolves.toEqual({
        state: 'connecting',
        qrcode: 'data:image/png;base64,AAA',
        phone: null,
        profileName: null,
      });
    });

    it('hibernated conta como desconectado', async () => {
      withInstance();
      client.getStatus.mockResolvedValue({
        status: 'hibernated',
        qrcode: null,
        phone: null,
        profileName: null,
      });
      await expect(service.getStatus()).resolves.toMatchObject({
        state: 'disconnected',
      });
    });

    it.each([401, 404])(
      'token recusado (%i) apaga a instância gravada e vira disconnected',
      async (httpStatus) => {
        withInstance();
        client.getStatus.mockRejectedValue(new UazapiError('x', httpStatus));
        await expect(service.getStatus()).resolves.toMatchObject({
          state: 'disconnected',
        });
        expect(instances.delete).toHaveBeenCalledWith('i1');
      },
    );

    it.each([500, null])(
      'erro %p vira unreachable sem apagar nada',
      async (httpStatus) => {
        withInstance();
        client.getStatus.mockRejectedValue(new UazapiError('x', httpStatus));
        await expect(service.getStatus()).resolves.toMatchObject({
          state: 'unreachable',
        });
        expect(instances.delete).not.toHaveBeenCalled();
      },
    );

    it('usa o cache por 30 s e ignora com fresh', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-22T12:00:00Z'));
      withInstance();
      client.getStatus.mockResolvedValue({
        status: 'connected',
        qrcode: null,
        phone: '55',
        profileName: null,
      });
      await service.getStatus();
      await service.getStatus();
      expect(client.getStatus).toHaveBeenCalledTimes(1);
      await service.getStatus({ fresh: true });
      expect(client.getStatus).toHaveBeenCalledTimes(2);
      jest.setSystemTime(new Date('2026-10-22T12:00:31Z'));
      await service.getStatus();
      expect(client.getStatus).toHaveBeenCalledTimes(3);
    });
  });

  describe('connect', () => {
    it('cria a instância na primeira vez, grava o token e inicia a conexão', async () => {
      client.getStatus.mockResolvedValue({
        status: 'connecting',
        qrcode: 'qr',
        phone: null,
        profileName: null,
      });
      instances.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'i1', token: 'tok-1' });
      await expect(service.connect()).resolves.toMatchObject({
        state: 'connecting',
        qrcode: 'qr',
      });
      expect(client.createInstance).toHaveBeenCalledWith('cantinho-estudo');
      expect(instances.save).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'tok-1' }),
      );
      expect(client.connect).toHaveBeenCalledWith('tok-1');
    });

    it('reaproveita a instância gravada', async () => {
      withInstance();
      client.getStatus.mockResolvedValue({
        status: 'connecting',
        qrcode: 'qr',
        phone: null,
        profileName: null,
      });
      await service.connect();
      expect(client.createInstance).not.toHaveBeenCalled();
    });

    it('recusa quando a UAZAPI não está configurada', async () => {
      client.isConfigured.mockReturnValue(false);
      await expect(service.connect()).rejects.toThrow(
        'WhatsApp não configurado no servidor',
      );
    });

    it('erro da UAZAPI chega como 503 com a mensagem dela', async () => {
      withInstance();
      client.connect.mockRejectedValue(
        new UazapiError('Limite de conexões', 429),
      );
      await expect(service.connect()).rejects.toThrow(
        ServiceUnavailableException,
      );
      await expect(service.connect()).rejects.toThrow('Limite de conexões');
    });
  });

  describe('disconnect', () => {
    it('encerra a sessão e devolve o status novo, sem cache', async () => {
      withInstance();
      client.getStatus.mockResolvedValue({
        status: 'connected',
        qrcode: null,
        phone: '55',
        profileName: null,
      });
      await service.getStatus();
      client.getStatus.mockResolvedValue({
        status: 'disconnected',
        qrcode: null,
        phone: null,
        profileName: null,
      });
      await expect(service.disconnect()).resolves.toMatchObject({
        state: 'disconnected',
      });
      expect(client.disconnect).toHaveBeenCalledWith('tok-1');
    });
  });
});
