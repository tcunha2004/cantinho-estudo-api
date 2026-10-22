import {
  classNoticeText,
  resolveAppUrl,
  signupApprovedText,
  toWhatsappNumber,
} from './whatsapp-text';
import { LocationType } from '../classes/enums/location-type.enum';

describe('whatsapp-text', () => {
  it.each([
    ['31999999999', '5531999999999'],
    ['(31) 99999-9999', '5531999999999'],
    [' 31 9 9999 9999 ', '5531999999999'],
  ])('normaliza %p', (raw, expected) =>
    expect(toWhatsappNumber(raw)).toBe(expected),
  );

  it.each(['3199999999', '319999999999', '', null, undefined])(
    'recusa %p',
    (raw) => expect(toWhatsappNumber(raw)).toBeNull(),
  );

  it('texto de aprovação com nome e link de login', () => {
    expect(signupApprovedText('Ana Souza', 'https://app.cantinho.com.br')).toBe(
      'Olá, Ana Souza! Seu cadastro no Cantinho do Estudo foi aprovado. Acesse o sistema: https://app.cantinho.com.br/login',
    );
  });

  it('APP_URL é obrigatória e perde a barra final', () => {
    expect(() => resolveAppUrl({ get: () => undefined } as never)).toThrow(
      'APP_URL',
    );
    expect(resolveAppUrl({ get: () => 'https://app.x/' } as never)).toBe(
      'https://app.x',
    );
  });

  describe('avisos de aula', () => {
    const aula = {
      studentName: 'João Pedro Silva',
      teacherName: 'Carlos Souza',
      subjectName: 'Matemática',
      scheduledAt: '2026-10-23T14:00:00',
      locationType: LocationType.HOME,
    };

    it('confirmação com primeiro nome, data, matéria e local', () => {
      expect(classNoticeText('class_scheduled', aula)).toBe(
        'João, sua aula está confirmada com Carlos Souza!\n\n' +
          'Data: sex, 23/10 às 14:00\n' +
          'Matéria: Matemática\n' +
          'Local: Casa',
      );
    });

    it('alteração repete os campos já com os dados novos', () => {
      expect(
        classNoticeText('class_changed', {
          ...aula,
          locationType: LocationType.SCHOOL,
        }),
      ).toBe(
        'João, sua aula com Carlos Souza foi alterada!\n\n' +
          'Data: sex, 23/10 às 14:00\n' +
          'Matéria: Matemática\n' +
          'Local: Cantinho',
      );
    });

    it('cancelamento em uma linha só', () => {
      expect(classNoticeText('class_cancelled', aula)).toBe(
        'João, sua aula de Matemática com Carlos Souza em sex, 23/10 às 14:00 foi cancelada.',
      );
    });

    it('dia da semana não depende do fuso do servidor', () => {
      expect(
        classNoticeText('class_cancelled', {
          ...aula,
          scheduledAt: '2026-10-25T00:30:00',
        }),
      ).toContain('dom, 25/10 às 00:30');
    });
  });
});
