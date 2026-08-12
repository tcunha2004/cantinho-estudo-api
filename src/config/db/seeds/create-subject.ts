import 'dotenv/config';
import { DataSource, EntityManager, ILike } from 'typeorm';
import dataSource from '../data-source';
import { TeacherEntity } from '../../../teachers/entity/teacher.entity';
import { SubjectEntity } from '../../../subjects/entity/subject.entity';

/*
 * Cria uma ou mais disciplinas e vincula a um professor já existente, sem
 * apagar nada — ao contrário do seed, que dá TRUNCATE em tudo. Serve para dar
 * disciplina a um professor criado pelo user:create, que nasce sem nenhuma.
 *
 *   npm run subject:create -- --teacher 0f3c...c81 --names "Matemática"
 *   npm run subject:create -- --email ana.moraes@cantinhodoestudo.com --names "Física, Química"
 *
 * Disciplinas com o mesmo nome (sem diferenciar maiúsculas/minúsculas) são
 * reaproveitadas em vez de duplicadas — a tabela `subjects` não tem uma
 * disciplina por professor, e sim um catálogo compartilhado entre todos.
 * Rodar duas vezes com o mesmo nome não duplica o vínculo.
 *
 * Flags:
 *   --teacher <uuid>  id do professor (aceita o id em `teachers` ou o user_id)
 *   --email <email>   alternativa ao --teacher: acha o professor pelo e-mail
 *   --names <lista>   nomes das disciplinas, separados por vírgula
 */

const USAGE = `
Uso:
  npm run subject:create -- --teacher <uuid> --names <lista>
  npm run subject:create -- --email <email do professor> --names <lista>

Obrigatório:
  --names <lista>   nomes das disciplinas, separados por vírgula

Exemplos:
  npm run subject:create -- --email ana.moraes@cantinhodoestudo.com --names "Matemática"
  npm run subject:create -- --teacher 8f14e45f-ceea-467a-9d1b-1a0f9b6b5c21 --names "Física, Química"
`.trim();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME_MAX_LENGTH = 100;

interface Options {
  teacher?: string;
  email?: string;
  names: string[];
}

/* ------------------------------------------------------------------ *
 * Argumentos
 * ------------------------------------------------------------------ */

/* Aceita apenas o formato `--chave valor`, que é o que os exemplos usam. */
function parseArgs(argv: string[]): Record<string, string> {
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

function parseNames(raw: string | undefined): string[] {
  if (!raw) {
    throw new Error(`Informe --names\n\n${USAGE}`);
  }

  const names = [
    ...new Set(
      raw
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    ),
  ];

  if (names.length === 0) {
    throw new Error('--names não pode ficar vazio');
  }

  const tooLong = names.find((name) => name.length > NAME_MAX_LENGTH);
  if (tooLong) {
    throw new Error(
      `Nome de disciplina muito longo (máx. ${NAME_MAX_LENGTH}): "${tooLong}"`,
    );
  }

  return names;
}

function parseOptions(argv: string[]): Options {
  const args = parseArgs(argv);

  if (!args.teacher && !args.email) {
    throw new Error(`Informe --teacher ou --email\n\n${USAGE}`);
  }

  return {
    teacher: args.teacher,
    email: args.email?.toLowerCase(),
    names: parseNames(args.names),
  };
}

/* ------------------------------------------------------------------ *
 * Resolução dos dados existentes
 * ------------------------------------------------------------------ */

async function resolveTeacher(
  manager: EntityManager,
  options: Options,
): Promise<TeacherEntity> {
  const teacherRepository = manager.getRepository(TeacherEntity);
  const relations = { user: true, subjects: true };

  if (options.email) {
    const teacher = await teacherRepository.findOne({
      where: { user: { email: options.email } },
      relations,
    });

    if (!teacher) {
      throw new Error(
        `Nenhum professor com o e-mail "${options.email}". Crie com ` +
          '`npm run user:create -- ... --role professor`.',
      );
    }

    return teacher;
  }

  const id = options.teacher!;

  /* Filtrar por uuid inválido estoura no Postgres antes de virar "não achei" */
  if (!UUID_PATTERN.test(id)) {
    throw new Error(`--teacher precisa ser um uuid (recebi "${id}")`);
  }

  /*
   * Aceita tanto o id da linha em `teachers` quanto o id do usuário: o painel
   * do admin lida com o primeiro, e o token de login carrega o segundo.
   */
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
 * Reaproveita a disciplina se já existir uma com o mesmo nome (comparação
 * sem diferenciar maiúsculas/minúsculas), senão cria uma nova.
 */
async function resolveOrCreateSubjects(
  manager: EntityManager,
  names: string[],
): Promise<{ subject: SubjectEntity; created: boolean }[]> {
  const subjectRepository = manager.getRepository(SubjectEntity);
  const results: { subject: SubjectEntity; created: boolean }[] = [];

  for (const name of names) {
    const existing = await subjectRepository.findOne({
      where: { name: ILike(name) },
    });

    if (existing) {
      results.push({ subject: existing, created: false });
      continue;
    }

    const subject = await subjectRepository.save(
      subjectRepository.create({ name }),
    );
    results.push({ subject, created: true });
  }

  return results;
}

/* ------------------------------------------------------------------ *
 * Geração
 * ------------------------------------------------------------------ */

/*
 * Tudo dentro de uma transação: se o vínculo com o professor falhar, a
 * disciplina recém-criada não fica órfã no banco.
 */
async function createSubjects(
  ds: DataSource,
  options: Options,
): Promise<void> {
  await ds.transaction(async (manager) => {
    const teacher = await resolveTeacher(manager, options);
    const resolved = await resolveOrCreateSubjects(manager, options.names);

    const linkedIds = new Set(teacher.subjects.map((subject) => subject.id));
    const toLink = resolved.filter(({ subject }) => !linkedIds.has(subject.id));

    if (toLink.length > 0) {
      teacher.subjects = [
        ...teacher.subjects,
        ...toLink.map(({ subject }) => subject),
      ];
      await manager.getRepository(TeacherEntity).save(teacher);
    }

    report(teacher, resolved, toLink.length > 0);
  });
}

function report(
  teacher: TeacherEntity,
  resolved: { subject: SubjectEntity; created: boolean }[],
  linked: boolean,
): void {
  console.log('');
  console.log(`Professor: ${teacher.user.name} <${teacher.user.email}>`);
  console.log(`  teacher_id: ${teacher.id}`);
  console.log(`  user_id:    ${teacher.user.id}`);

  console.log('');
  console.log('Disciplinas:');
  for (const { subject, created } of resolved) {
    const alreadyLinked = teacher.subjects.some(
      (item) => item.id === subject.id && !created,
    );
    const tag = created
      ? 'nova'
      : alreadyLinked
        ? 'já vinculada'
        : 'já existia';
    console.log(`  ${subject.name.padEnd(30)} (${subject.id})  ${tag}`);
  }

  console.log('');
  console.log(
    linked
      ? `Vínculo atualizado: o professor agora dá ${teacher.subjects.length} disciplina(s).`
      : 'Nenhum vínculo novo: todas as disciplinas informadas já eram do professor.',
  );
  console.log('');
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    return;
  }

  const options = parseOptions(process.argv.slice(2));
  const ds = await dataSource.initialize();

  try {
    await createSubjects(ds, options);
  } finally {
    await ds.destroy();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
