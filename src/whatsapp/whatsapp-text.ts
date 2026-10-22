import { ConfigService } from '@nestjs/config';

/*
 * Telefone do cadastro → número da UAZAPI. Só 11 dígitos (DDD + celular) são
 * aceitos; qualquer outra coisa é nula e vira falha "Telefone inválido" sem
 * chamar a UAZAPI. Alunos antigos têm máscara gravada, por isso tira os
 * não-dígitos antes.
 */
export function toWhatsappNumber(
  raw: string | null | undefined,
): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length === 11 ? `55${digits}` : null;
}

export function signupApprovedText(name: string, appUrl: string): string {
  return `Olá, ${name}! Seu cadastro no Cantinho do Estudo foi aprovado. Acesse o sistema: ${appUrl}/login`;
}

/* Sem APP_URL a mensagem sairia sem link; por isso a API nem sobe. */
export function resolveAppUrl(config: ConfigService): string {
  const url = config.get<string>('APP_URL');
  if (!url) throw new Error('APP_URL não configurada');
  return url.replace(/\/$/, '');
}
