import { ServiceUnavailableException } from '@nestjs/common';
import { UazapiError } from './uazapi.client';
import { WhatsappService } from './whatsapp.service';
import { LocationType } from '../classes/enums/location-type.enum';

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
  let messages: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
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
    messages = {
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => ({ id: 'm1', ...d })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    };
    const config = { get: () => 'https://app.x' };
    service = new WhatsappService(
      instances as never,
      client as never,
      messages as never,
      config as never,
    );
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

    it.each([401, 404])(
      'instância apagada na UAZAPI (%i): apaga a gravada, cria outra e conecta',
      async (httpStatus) => {
        withInstance();
        client.createInstance.mockResolvedValue('tok-2');
        client.connect
          .mockRejectedValueOnce(new UazapiError('x', httpStatus))
          .mockResolvedValue(undefined);
        client.getStatus.mockResolvedValue({
          status: 'connecting',
          qrcode: 'qr',
          phone: null,
          profileName: null,
        });

        await expect(service.connect()).resolves.toMatchObject({
          state: 'connecting',
        });

        expect(instances.delete).toHaveBeenCalledWith('i1');
        expect(client.createInstance).toHaveBeenCalledTimes(1);
        expect(client.connect).toHaveBeenLastCalledWith('tok-2');
      },
    );

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

  describe('notifySignupApproved', () => {
    const ana = {
      role: 'student' as const,
      id: 's1',
      name: 'Ana Souza',
      phone: '(31) 99999-9999',
    };

    it('grava pending antes de chamar a UAZAPI e marca sent depois', async () => {
      withInstance();
      await service.notifySignupApproved(ana);
      expect(messages.save.mock.calls[0][0]).toMatchObject({
        status: 'pending',
        kind: 'signup_approved',
        student: { id: 's1' },
      });
      expect(client.sendText).toHaveBeenCalledWith(
        'tok-1',
        '5531999999999',
        'Olá, Ana Souza! Seu cadastro no Cantinho do Estudo foi aprovado. Acesse o sistema: https://app.x/login',
      );
      expect(messages.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'sent', error: null }),
      );
    });

    it('no cadastro de professor liga a mensagem ao professor', async () => {
      withInstance();
      await service.notifySignupApproved({
        role: 'professor',
        id: 't1',
        name: 'Carlos Lima',
        phone: '(31) 97777-6666',
      });
      expect(messages.save.mock.calls[0][0]).toMatchObject({
        status: 'pending',
        kind: 'signup_approved',
        student: null,
        teacher: { id: 't1' },
      });
      expect(client.sendText).toHaveBeenCalledWith(
        'tok-1',
        '5531977776666',
        'Olá, Carlos Lima! Seu cadastro no Cantinho do Estudo foi aprovado. Acesse o sistema: https://app.x/login',
      );
    });

    it('telefone inválido falha sem chamar a UAZAPI', async () => {
      withInstance();
      await service.notifySignupApproved({ ...ana, phone: '3199999' });
      expect(client.sendText).not.toHaveBeenCalled();
      expect(messages.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'Telefone inválido',
        }),
      );
    });

    it('sem instância gravada falha como não conectado', async () => {
      await service.notifySignupApproved(ana);
      expect(messages.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'WhatsApp não conectado',
        }),
      );
    });

    it('erro da UAZAPI fica registrado com a mensagem dela', async () => {
      withInstance();
      client.sendText.mockRejectedValue(
        new UazapiError('O servidor do WhatsApp recusou esta mensagem.', 500),
      );
      await service.notifySignupApproved(ana);
      expect(messages.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'O servidor do WhatsApp recusou esta mensagem.',
        }),
      );
    });

    it('nunca rejeita, nem se o banco falhar', async () => {
      messages.save.mockRejectedValue(new Error('db down'));
      await expect(service.notifySignupApproved(ana)).resolves.toBeUndefined();
    });
  });

  describe('notifyClass', () => {
    const aula = {
      studentId: 's1',
      studentPhone: '31999999999',
      studentName: 'Ana Souza',
      teacherName: 'Carlos Lima',
      subjectName: 'Física',
      scheduledAt: '2026-10-23T14:00:00',
      locationType: LocationType.SCHOOL,
    };

    it('grava a situação da aula ligada ao aluno e envia o texto', async () => {
      withInstance();
      await service.notifyClass('class_cancelled', aula);
      expect(messages.save.mock.calls[0][0]).toMatchObject({
        status: 'pending',
        kind: 'class_cancelled',
        student: { id: 's1' },
      });
      expect(client.sendText).toHaveBeenCalledWith(
        'tok-1',
        '5531999999999',
        'Ana, sua aula de Física com Carlos Lima em sex, 23/10 às 14:00 foi cancelada.',
      );
    });

    it('nunca rejeita, nem se o banco falhar', async () => {
      messages.save.mockRejectedValue(new Error('db down'));
      await expect(
        service.notifyClass('class_scheduled', aula),
      ).resolves.toBeUndefined();
    });
  });

  describe('resend', () => {
    it('reenvia o texto gravado para o telefone ATUAL do aluno', async () => {
      withInstance();
      messages.findOne.mockResolvedValue({
        id: 'm1',
        phone: '3100',
        text: 'texto antigo',
        status: 'failed',
        student: { id: 's1', phone: '31988887777' },
      });
      await expect(service.resend('m1')).resolves.toEqual({
        id: 'm1',
        status: 'sent',
        error: null,
      });
      expect(client.sendText).toHaveBeenCalledWith(
        'tok-1',
        '5531988887777',
        'texto antigo',
      );
    });

    it('reenvia para o telefone ATUAL do professor', async () => {
      withInstance();
      messages.findOne.mockResolvedValue({
        id: 'm1',
        phone: '3100',
        text: 'texto antigo',
        status: 'failed',
        student: null,
        teacher: { id: 't1', phone: '31977776666' },
      });
      await service.resend('m1');
      expect(client.sendText).toHaveBeenCalledWith(
        'tok-1',
        '5531977776666',
        'texto antigo',
      );
    });

    it('recusa mensagem que não é falha nem pending interrompida (clique duplo)', async () => {
      messages.findOne.mockResolvedValue(null);
      await expect(service.resend('m1')).rejects.toThrow(
        'Esta mensagem não pode ser reenviada',
      );
      expect(client.sendText).not.toHaveBeenCalled();
    });

    it('o corte de "interrompida" é feito no SQL, com o relógio do banco', async () => {
      messages.findOne.mockResolvedValue(null);
      await service.resend('m1').catch(() => undefined);
      const stale = messages.findOne.mock.calls[0][0].where[1].createdAt;
      expect(stale.getSql('"created_at"')).toBe(
        `"created_at" < now() - interval '5 minutes'`,
      );
    });

    it('busca só failed ou pending com mais de 5 minutos', async () => {
      messages.findOne.mockResolvedValue(null);
      await service.resend('m1').catch(() => undefined);
      const where = messages.findOne.mock.calls[0][0].where;
      expect(where).toEqual([
        { id: 'm1', status: 'failed' },
        { id: 'm1', status: 'pending', createdAt: expect.anything() },
      ]);
    });
  });

  describe('discard', () => {
    it('marca discarded', async () => {
      messages.findOne.mockResolvedValue({ id: 'm1', status: 'failed' });
      await service.discard('m1');
      expect(messages.update).toHaveBeenCalledWith('m1', {
        status: 'discarded',
      });
    });

    it('recusa o que não é falha', async () => {
      messages.findOne.mockResolvedValue(null);
      await expect(service.discard('m1')).rejects.toThrow(
        'Esta mensagem não pode ser descartada',
      );
    });
  });

  describe('listFailures', () => {
    it('pending interrompida aparece com o motivo próprio, com nome do destinatário', async () => {
      messages.find.mockResolvedValue([
        {
          id: 'm1',
          phone: '31',
          text: 't',
          status: 'pending',
          error: null,
          createdAt: '2026-10-22T10:00:00',
          student: { user: { name: 'Ana' } },
          teacher: null,
        },
        {
          id: 'm3',
          phone: '31',
          text: 't',
          status: 'failed',
          error: null,
          createdAt: '2026-10-22T09:30:00',
          student: null,
          teacher: { user: { name: 'Carlos' } },
        },
        {
          id: 'm2',
          phone: '31',
          text: 't',
          status: 'failed',
          error: 'Telefone inválido',
          createdAt: '2026-10-22T09:00:00',
          student: null,
          teacher: null,
        },
      ]);
      await expect(service.listFailures()).resolves.toEqual([
        {
          id: 'm1',
          recipientName: 'Ana',
          phone: '31',
          text: 't',
          error: 'Envio interrompido',
          createdAt: '2026-10-22T10:00:00',
        },
        {
          id: 'm3',
          recipientName: 'Carlos',
          phone: '31',
          text: 't',
          error: 'Falha no envio',
          createdAt: '2026-10-22T09:30:00',
        },
        {
          id: 'm2',
          recipientName: null,
          phone: '31',
          text: 't',
          error: 'Telefone inválido',
          createdAt: '2026-10-22T09:00:00',
        },
      ]);
    });
  });
});
