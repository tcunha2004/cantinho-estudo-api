import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';
import { TeacherEntity } from '../../../teachers/entity/teacher.entity';
import { StudentEntity } from '../../../students/entity/student.entity';

/*
 * Utilidades compartilhadas pelos seeds especializados (user/subject/contract/
 * classes). O seed principal (seed.ts) não usa este arquivo — ele já trunca e
 * recria tudo, então não precisa resolver "o que já existe".
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ *
 * Argumentos de linha de comando
 * ------------------------------------------------------------------ */

/* Aceita apenas o formato `--chave valor`, que é o que os exemplos usam. */
export function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};

  for (let index = 0; index < argv.length; index++) {
    const current = argv[index];

    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`A flag --${key} está sem valor`);
    }

    args[key] = value;
    index++;
  }

  return args;
}

export function parseBoolean(
  raw: string | undefined,
  fallback: boolean,
  flag: string,
): boolean {
  if (raw === undefined) {
    return fallback;
  }

  const value = raw.toLowerCase();

  if (['yes', 'y', 'true', 'sim', 's', '1'].includes(value)) {
    return true;
  }

  if (['no', 'n', 'false', 'nao', 'não', '0'].includes(value)) {
    return false;
  }

  throw new Error(`--${flag} precisa ser yes ou no (recebi "${raw}")`);
}

/* ------------------------------------------------------------------ *
 * Data e dinheiro
 * ------------------------------------------------------------------ */

export function money(value: number): string {
  return value.toFixed(2);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/* 'YYYY-MM-DD' no fuso local (colunas date) */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/*
 * 'YYYY-MM-DD HH:mm:ss' no fuso local (colunas timestamp without time zone).
 * Passar string evita o driver converter a Date para UTC e deslocar a hora em
 * relação ao que as queries de período esperam.
 */
export function toTimestampString(date: Date): string {
  return `${toDateString(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function at(date: Date, hour: number, minute = 0): Date {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

/* Meia-noite local a partir de 'YYYY-MM-DD' — new Date(iso) leria como UTC */
export function fromDateString(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function parseDate(raw: string, flag: string): string {
  if (!DATE_PATTERN.test(raw)) {
    throw new Error(`--${flag} precisa estar no formato YYYY-MM-DD`);
  }

  /* Rejeita datas do tipo 2026-02-31, que o Postgres recusaria depois */
  if (toDateString(fromDateString(raw)) !== raw) {
    throw new Error(`--${flag} não é uma data válida: "${raw}"`);
  }

  return raw;
}

/* ------------------------------------------------------------------ *
 * Senha
 * ------------------------------------------------------------------ */

/* Mesma regra de custo usada pelo seed principal */
export async function hashPassword(password: string): Promise<string> {
  const configured = Number(process.env.BCRYPT_SALT_ROUNDS);
  const rounds =
    Number.isInteger(configured) && configured > 0 ? configured : 10;
  return bcrypt.hash(password, rounds);
}

/* ------------------------------------------------------------------ *
 * Resolução de professor/aluno por uuid ou e-mail
 * ------------------------------------------------------------------ */

/*
 * Aceita tanto o id da linha em `teachers` quanto o id do usuário: o painel do
 * admin lida com o primeiro, e o token de login carrega o segundo.
 */
export async function resolveTeacher(
  manager: EntityManager,
  identifier: { teacher?: string; email?: string },
  relations: Record<string, unknown> = { user: true, subjects: true },
): Promise<TeacherEntity> {
  const teacherRepository = manager.getRepository(TeacherEntity);

  if (identifier.email) {
    const teacher = await teacherRepository.findOne({
      where: { user: { email: identifier.email } },
      relations,
    });

    if (!teacher) {
      throw new Error(
        `Nenhum professor com o e-mail "${identifier.email}". Crie com ` +
          '`npm run user:create -- ... --role professor`.',
      );
    }

    return teacher;
  }

  const id = identifier.teacher!;

  /* Filtrar por uuid inválido estoura no Postgres antes de virar "não achei" */
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`--teacher precisa ser um uuid (recebi "${id}")`);
  }

  const teacher =
    (await teacherRepository.findOne({ where: { id }, relations })) ??
    (await teacherRepository.findOne({
      where: { user: { id } },
      relations,
    }));

  if (!teacher) {
    throw new Error(
      `Nenhum professor com id (nem user_id) ${id}. Confira em ` +
        '`select t.id, t.user_id, u.name from teachers t join users u on u.id = t.user_id`.',
    );
  }

  return teacher;
}

/*
 * Aceita tanto o id da linha em `students` quanto o id do usuário: o painel do
 * admin lida com o primeiro, e o token de login carrega o segundo.
 */
export async function resolveStudent(
  manager: EntityManager,
  identifier: { student?: string; email?: string },
  relations: Record<string, unknown> = { user: true, region: true },
): Promise<StudentEntity> {
  const studentRepository = manager.getRepository(StudentEntity);

  if (identifier.email) {
    const student = await studentRepository.findOne({
      where: { user: { email: identifier.email } },
      relations,
    });

    if (!student) {
      throw new Error(
        `Nenhum aluno com o e-mail "${identifier.email}". Crie com ` +
          '`npm run user:create -- ... --role student`.',
      );
    }

    return student;
  }

  const id = identifier.student!;

  /* Filtrar por uuid inválido estoura no Postgres antes de virar "não achei" */
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`--student precisa ser um uuid (recebi "${id}")`);
  }

  const student =
    (await studentRepository.findOne({ where: { id }, relations })) ??
    (await studentRepository.findOne({ where: { user: { id } }, relations }));

  if (!student) {
    throw new Error(
      `Nenhum aluno com id (nem user_id) ${id}. Confira em ` +
        '`select s.id, s.user_id, u.name from students s join users u on u.id = s.user_id`.',
    );
  }

  return student;
}

/* ------------------------------------------------------------------ *
 * Ciclo de vida do DataSource
 * ------------------------------------------------------------------ */

export async function withDataSource(
  dataSource: DataSource,
  action: (ds: DataSource) => Promise<void>,
): Promise<void> {
  const ds = await dataSource.initialize();

  try {
    await action(ds);
  } finally {
    await ds.destroy();
  }
}
