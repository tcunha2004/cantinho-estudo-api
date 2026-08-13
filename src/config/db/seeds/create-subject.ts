import 'dotenv/config';
import { DataSource, EntityManager, ILike } from 'typeorm';
import dataSource from '../data-source';
import { TeacherEntity } from '../../../teachers/entity/teacher.entity';
import { SubjectEntity } from '../../../subjects/entity/subject.entity';
import { parseArgs, resolveTeacher, withDataSource } from './helpers';

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

const NAME_MAX_LENGTH = 100;

interface Options {
  teacher?: string;
  email?: string;
  names: string[];
}

/* ------------------------------------------------------------------ *
 * Argumentos
 * ------------------------------------------------------------------ */

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
async function createSubjects(ds: DataSource, options: Options): Promise<void> {
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
  await withDataSource(dataSource, (ds) => createSubjects(ds, options));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
