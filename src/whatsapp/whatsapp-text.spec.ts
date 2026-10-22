import {
  resolveAppUrl,
  signupApprovedText,
  toWhatsappNumber,
} from './whatsapp-text';

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
});
