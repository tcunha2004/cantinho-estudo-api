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

/* Retorna o intervalo do mês atual: dia 1 00:00:00 até o último dia 23:59:59.999 */
export function getCurrentMonthRange(now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return { start: start.toISOString(), end: end.toISOString() };
}
