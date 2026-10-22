import { ConfigService } from '@nestjs/config';
import { LocationType } from '../classes/enums/location-type.enum';

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

export type ClassNoticeKind =
  | 'class_scheduled'
  | 'class_changed'
  | 'class_cancelled';

export interface ClassNotice {
  studentName: string;
  teacherName: string;
  subjectName: string;
  /* Horário local ingênuo, como o banco guarda: `2026-10-23T14:00:00`. */
  scheduledAt: string;
  locationType: LocationType;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const LOCATIONS: Record<LocationType, string> = {
  [LocationType.HOME]: 'Casa',
  [LocationType.SCHOOL]: 'Cantinho',
};

/* `qui, 23/10 às 14:00`. Lê os campos do texto, sem passar por fuso. */
function classDate(naive: string): string {
  const [, y, m, d, time] = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})/.exec(
    naive,
  )!;
  const weekday = WEEKDAYS[new Date(Date.UTC(+y, +m - 1, +d)).getUTCDay()];
  return `${weekday}, ${d}/${m} às ${time}`;
}

/* Sem artigo antes do professor: "com o"/"com a" exigiria saber o gênero. */
export function classNoticeText(
  kind: ClassNoticeKind,
  notice: ClassNotice,
): string {
  const name = notice.studentName.trim().split(/\s+/)[0];
  const date = classDate(notice.scheduledAt);
  if (kind === 'class_cancelled') {
    return `${name}, sua aula de ${notice.subjectName} com ${notice.teacherName} em ${date} foi cancelada.`;
  }
  const headline =
    kind === 'class_scheduled'
      ? `${name}, sua aula está confirmada com ${notice.teacherName}!`
      : `${name}, sua aula com ${notice.teacherName} foi alterada!`;
  return [
    headline,
    '',
    `Data: ${date}`,
    `Matéria: ${notice.subjectName}`,
    `Local: ${LOCATIONS[notice.locationType]}`,
  ].join('\n');
}

/* Sem APP_URL a mensagem sairia sem link; por isso a API nem sobe. */
export function resolveAppUrl(config: ConfigService): string {
  const url = config.get<string>('APP_URL');
  if (!url) throw new Error('APP_URL não configurada');
  return url.replace(/\/$/, '');
}
