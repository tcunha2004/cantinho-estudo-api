export interface DateRange {
  start: string;
  end: string;
}

/*
 * ─── Horário ingênuo (sem fuso) ────────────────────────────────────────────
 *
 * `classes.scheduled_at` e outras colunas `timestamp` são SEM fuso e guardam
 * hora de parede local de São Paulo ("2026-08-10 14:30:00"). O container roda
 * em UTC (sem TZ configurado), então `new Date()` e `toISOString()` não dão a
 * hora de São Paulo — todo o sistema trabalha com strings ingênuas de ponta a
 * ponta: entra ingênuo, compara ingênuo, sai ingênuo.
 */

export const APP_TIMEZONE = 'America/Sao_Paulo';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Hora de parede atual em São Paulo, independente do TZ do processo. */
export function nowNaive(): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());

  return parts.replace(' ', 'T');
}

/** Apenas a data atual de São Paulo: YYYY-MM-DD. */
export function todayNaive(): string {
  return nowNaive().slice(0, 10);
}

/* 'YYYY-MM-DD' de um Date construído por componentes de calendário (sem
 * relação com o TZ do processo — os componentes já são o que importa). */
function toDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* Retorna o intervalo do dia atual de São Paulo: 00:00:00 até 23:59:59.999 */
export function getCurrentDayRange(): DateRange {
  const today = todayNaive();
  return { start: `${today}T00:00:00`, end: `${today}T23:59:59.999` };
}

/* Retorna o intervalo da semana atual: domingo 00:00:00 até sábado
 * 23:59:59.999, baseado no dia de São Paulo. */
export function getCurrentWeekRange(): DateRange {
  const [year, month, day] = todayNaive().split('-').map(Number);
  const dayOfWeek = new Date(year, month - 1, day).getDay(); // 0 = domingo

  const start = toDateOnly(new Date(year, month - 1, day - dayOfWeek));
  const end = toDateOnly(new Date(year, month - 1, day - dayOfWeek + 6));

  return { start: `${start}T00:00:00`, end: `${end}T23:59:59.999` };
}

/* Retorna o intervalo de um mês específico (month: 1-12): dia 1 00:00:00 até
 * o último dia 23:59:59.999 */
export function getMonthRange(year: number, month: number): DateRange {
  const start = toDateOnly(new Date(year, month - 1, 1));
  const end = toDateOnly(new Date(year, month, 0));

  return { start: `${start}T00:00:00`, end: `${end}T23:59:59.999` };
}

/* Retorna o intervalo do mês atual, a partir do dia de São Paulo. */
export function getCurrentMonthRange(): DateRange {
  const [year, month] = todayNaive().split('-').map(Number);
  return getMonthRange(year, month);
}

/* Normaliza 'YYYY-MM-DDTHH:mm[:ss]' (formato do input do navegador) para 'YYYY-MM-DDTHH:mm:ss' */
export function toNaiveTimestamp(value: string): string {
  const [date, time] = value.split(/[T ]/);
  const [hour, minute, second = '00'] = time.split(':');

  return `${date}T${hour}:${minute}:${second}`;
}

/* Formata o que veio do banco (Date ou string) como 'YYYY-MM-DDTHH:mm:ss', sem sufixo de fuso */
export function toNaiveIso(value: Date | string): string {
  if (typeof value === 'string') {
    const [date, time] = value.split(/[T ]/);
    return `${date}T${time.slice(0, 8)}`;
  }

  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;

  return `${date}T${time}`;
}

/* Soma minutos a um horário ingênuo, devolvendo outro horário ingênuo */
export function addMinutesToNaive(value: string, minutes: number): string {
  const [date, time] = value.split(/[T ]/);
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);

  const result = new Date(year, month - 1, day, hour, minute + minutes, second);

  return toNaiveIso(result);
}

/*
 * Intervalo ingênuo cobrindo os dias informados (from/to no formato YYYY-MM-DD):
 * do início do primeiro dia ao fim do último.
 */
export function getNaiveDayRange(from: string, to: string): DateRange {
  return { start: `${from}T00:00:00`, end: `${to}T23:59:59.999` };
}

/*
 * Soma meses a uma data ingênua (YYYY-MM-DD), preservando o dia; quando o dia
 * não existe no mês de destino, cai no último dia dele (31/01 → 28/02).
 */
export function addMonthsToDate(value: string, months: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const daysInTargetMonth = new Date(year, month - 1 + months + 1, 0).getDate();

  return toDateOnly(
    new Date(year, month - 1 + months, Math.min(day, daysInTargetMonth)),
  );
}

/*
 * Garante que colunas `timestamp` cheguem à aplicação como string ingênua,
 * e não como Date, que o JSON.stringify converteria para UTC com `Z`.
 */
export const naiveTimestampTransformer = {
  from: (value: Date | string | null) =>
    value == null ? null : toNaiveIso(value),
  to: (value: string | Date | null) => value,
};
