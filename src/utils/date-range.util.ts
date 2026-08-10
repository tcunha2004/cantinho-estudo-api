export interface DateRange {
  start: string;
  end: string;
}

/* Retorna o intervalo da semana atual: domingo 00:00:00 até sábado 23:59:59.999 */
export function getCurrentWeekRange(now: Date = new Date()): DateRange {
  const dayOfWeek = now.getDay(); // 0 = domingo, 1 = segunda, ... 6 = sábado

  const start = new Date(now);
  start.setDate(now.getDate() - dayOfWeek);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start: start.toISOString(), end: end.toISOString() };
}

/* Retorna o intervalo do dia atual: 00:00:00 até 23:59:59.999 */
export function getCurrentDayRange(now: Date = new Date()): DateRange {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { start: start.toISOString(), end: end.toISOString() };
}

/* Retorna o intervalo de um mês específico (month: 1-12): dia 1 00:00:00 até o último dia 23:59:59.999 */
export function getMonthRange(year: number, month: number): DateRange {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);

  return { start: start.toISOString(), end: end.toISOString() };
}

/* Retorna o intervalo do mês atual: dia 1 00:00:00 até o último dia 23:59:59.999 */
export function getCurrentMonthRange(now: Date = new Date()): DateRange {
  return getMonthRange(now.getFullYear(), now.getMonth() + 1);
}

/*
 * ─── Horário ingênuo (sem fuso) ────────────────────────────────────────────
 *
 * `classes.scheduled_at` é `timestamp` SEM fuso e todas as linhas foram
 * gravadas em hora local ("2026-08-10 14:30:00"). Chamar `toISOString()` nesse
 * caminho desloca tudo pelo offset do fuso, então a agenda trabalha com strings
 * ingênuas de ponta a ponta: entra ingênuo, compara ingênuo, sai ingênuo.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/* Normaliza 'YYYY-MM-DDTHH:mm[:ss]' (formato do input do navegador) para 'YYYY-MM-DD HH:mm:ss' */
export function toNaiveTimestamp(value: string): string {
  const [date, time] = value.split(/[T ]/);
  const [hour, minute, second = '00'] = time.split(':');

  return `${date} ${hour}:${minute}:${second}`;
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
  return { start: `${from} 00:00:00`, end: `${to} 23:59:59.999` };
}
