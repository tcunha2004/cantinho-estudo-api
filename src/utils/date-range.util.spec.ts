import {
  addMinutesToNaive,
  getCurrentDayRange,
  getCurrentMonthRange,
  getCurrentWeekRange,
  getMonthRange,
  getNaiveDayRange,
  nowNaive,
  todayNaive,
  toNaiveIso,
  toNaiveTimestamp,
} from './date-range.util';

/*
 * São Paulo está em UTC-3 o ano inteiro (sem horário de verão desde 2019).
 * Todo teste aqui deve valer byte a byte sob `TZ=UTC` e `TZ=America/Sao_Paulo`
 * — essa igualdade é a propriedade que os bugs de fuso violaram.
 */

describe('date-range.util', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('nowNaive / todayNaive', () => {
    it('converte o instante UTC para a hora de parede de São Paulo', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'));

      expect(nowNaive()).toBe('2026-08-13T09:00:00');
      expect(todayNaive()).toBe('2026-08-13');
    });

    it('fronteira 23:30 local: instante já é o dia seguinte em UTC', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-14T02:30:00.000Z'));

      expect(nowNaive()).toBe('2026-08-13T23:30:00');
      expect(todayNaive()).toBe('2026-08-13');
    });

    it('fronteira 00:30 local: instante ainda é o mesmo dia em UTC', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-14T03:30:00.000Z'));

      expect(nowNaive()).toBe('2026-08-14T00:30:00');
      expect(todayNaive()).toBe('2026-08-14');
    });

    it('é independente do TZ do processo', () => {
      const original = process.env.TZ;
      jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'));

      process.env.TZ = 'UTC';
      const underUtc = nowNaive();

      process.env.TZ = 'America/Sao_Paulo';
      const underSaoPaulo = nowNaive();

      process.env.TZ = original;

      expect(underUtc).toBe('2026-08-13T09:00:00');
      expect(underUtc).toBe(underSaoPaulo);
    });
  });

  describe('getCurrentDayRange', () => {
    it('cobre 00:00:00 até 23:59:59.999 do dia de São Paulo', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'));

      expect(getCurrentDayRange()).toEqual({
        start: '2026-08-13T00:00:00',
        end: '2026-08-13T23:59:59.999',
      });
    });
  });

  describe('getCurrentWeekRange', () => {
    it('cobre domingo 00:00:00 até sábado 23:59:59.999 (2026-08-13 é quinta)', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'));

      expect(getCurrentWeekRange()).toEqual({
        start: '2026-08-09T00:00:00',
        end: '2026-08-15T23:59:59.999',
      });
    });
  });

  describe('getMonthRange', () => {
    it('fevereiro não bissexto: dia 1 até dia 28', () => {
      expect(getMonthRange(2026, 2)).toEqual({
        start: '2026-02-01T00:00:00',
        end: '2026-02-28T23:59:59.999',
      });
    });

    it('dezembro: dia 1 até dia 31, sem estourar para o próximo ano', () => {
      expect(getMonthRange(2026, 12)).toEqual({
        start: '2026-12-01T00:00:00',
        end: '2026-12-31T23:59:59.999',
      });
    });

    it('janeiro: dia 1 até dia 31', () => {
      expect(getMonthRange(2026, 1)).toEqual({
        start: '2026-01-01T00:00:00',
        end: '2026-01-31T23:59:59.999',
      });
    });
  });

  describe('getCurrentMonthRange', () => {
    it('deriva do dia de São Paulo (todayNaive), não do relógio do processo', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-13T12:00:00.000Z'));

      expect(getCurrentMonthRange()).toEqual({
        start: '2026-08-01T00:00:00',
        end: '2026-08-31T23:59:59.999',
      });
    });
  });

  describe('toNaiveIso', () => {
    it('converte uma string com espaço para o separador T', () => {
      expect(toNaiveIso('2026-08-13 09:00:00')).toBe('2026-08-13T09:00:00');
    });

    it('mantém uma string que já usa T', () => {
      expect(toNaiveIso('2026-08-13T09:00:00')).toBe('2026-08-13T09:00:00');
    });

    it('formata um Date pelos componentes locais, sem toISOString()', () => {
      const date = new Date(2026, 7, 13, 9, 0, 0);
      expect(toNaiveIso(date)).toBe('2026-08-13T09:00:00');
    });
  });

  describe('toNaiveTimestamp', () => {
    it('normaliza o formato do input do navegador (sem segundos)', () => {
      expect(toNaiveTimestamp('2026-08-13T09:00')).toBe('2026-08-13T09:00:00');
    });

    it('mantém os segundos quando já presentes', () => {
      expect(toNaiveTimestamp('2026-08-13T09:00:30')).toBe(
        '2026-08-13T09:00:30',
      );
    });
  });

  describe('addMinutesToNaive', () => {
    it('soma minutos sem atravessar o dia', () => {
      expect(addMinutesToNaive('2026-08-13T09:00:00', 90)).toBe(
        '2026-08-13T10:30:00',
      );
    });

    it('atravessa a virada do dia corretamente', () => {
      expect(addMinutesToNaive('2026-08-13T23:30:00', 90)).toBe(
        '2026-08-14T01:00:00',
      );
    });
  });

  describe('getNaiveDayRange', () => {
    it('cobre do início do primeiro dia ao fim do último', () => {
      expect(getNaiveDayRange('2026-08-09', '2026-08-15')).toEqual({
        start: '2026-08-09T00:00:00',
        end: '2026-08-15T23:59:59.999',
      });
    });
  });
});
