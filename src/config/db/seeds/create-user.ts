import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager } from 'typeorm';
import dataSource from '../data-source';
import { UserEntity, UserRole } from '../../../users/entity/user.entity';
import { RegionEntity } from '../../../regions/entity/region.entity';
import { TeacherEntity } from '../../../teachers/entity/teacher.entity';
import { StudentEntity } from '../../../students/entity/student.entity';

/*
 * Cria um único usuário no banco, sem apagar nada — ao contrário do seed, que
 * dá TRUNCATE em tudo. Serve para abrir um acesso rápido durante o
 * desenvolvimento.
 *
 *   npm run user:create -- --name "Maria Souza" --email maria@escola.com --password Senha123 --role professor
 *
 * Papéis professor e student também ganham o registro em `teachers` /
 * `students`: sem ele o login funciona, mas as telas do papel ficam vazias,
 * porque os endpoints buscam pelo vínculo com o usuário.
 *
 * Flags só usadas por --role student:
 *   --region <slug>   região do aluno (padrão: a primeira região ativa)
 *   --phone  <texto>  telefone do aluno (padrão: (11) 90000-0000)
 */

const ROLES: UserRole[] = ['admin', 'professor', 'student'];

const DEFAULT_PHONE = '(11) 90000-0000';

const USAGE = `
Uso:
  npm run user:create -- --name <nome> --email <email> --password <senha> --role <papel>

Papéis: ${ROLES.join(' | ')}

Opcionais (apenas para --role student):
  --region <slug>   região do aluno (padrão: primeira região ativa)
  --phone <texto>   telefone do aluno (padrão: ${DEFAULT_PHONE})

Exemplos:
  npm run user:create -- --name "Ana Lima" --email ana@escola.com --password Senha123 --role admin
  npm run user:create -- --name "Caio Reis" --email caio@escola.com --password Senha123 --role student --region zona-sul
`.trim();

interface Options {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  region?: string;
  phone?: string;
}

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

function parseOptions(argv: string[]): Options {
  const args = parseArgs(argv);
  const missing = ['name', 'email', 'password', 'role'].filter(
    (key) => !args[key],
  );

  if (missing.length > 0) {
    throw new Error(
      `Faltou informar: ${missing.map((key) => `--${key}`).join(', ')}\n\n${USAGE}`,
    );
  }

  const role = args.role as UserRole;

  if (!ROLES.includes(role)) {
    throw new Error(
      `Papel inválido: "${args.role}". Use um destes: ${ROLES.join(', ')}`,
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.email)) {
    throw new Error(`E-mail inválido: "${args.email}"`);
  }

  /* Mesmo mínimo exigido pelo formulário de login do frontend */
  if (args.password.length < 6) {
    throw new Error('A senha precisa ter ao menos 6 caracteres');
  }

  return {
    name: args.name,
    email: args.email.toLowerCase(),
    password: args.password,
    role,
    region: args.region,
    phone: args.phone,
  };
}

/* Mesma regra de custo usada pelo seed */
async function hash(password: string): Promise<string> {
  const configured = Number(process.env.BCRYPT_SALT_ROUNDS);
  const rounds =
    Number.isInteger(configured) && configured > 0 ? configured : 10;
  return bcrypt.hash(password, rounds);
}

async function resolveRegion(
  manager: EntityManager,
  slug: string | undefined,
): Promise<RegionEntity> {
  const regionRepository = manager.getRepository(RegionEntity);

  if (slug) {
    const region = await regionRepository.findOneBy({ slug });

    if (!region) {
      const available = await regionRepository.find({ order: { name: 'ASC' } });
      throw new Error(
        `Região "${slug}" não encontrada. Disponíveis: ${
          available.map((item) => item.slug).join(', ') || '(nenhuma)'
        }`,
      );
    }

    return region;
  }

  const region = await regionRepository.findOne({
    where: { active: true },
    order: { name: 'ASC' },
  });

  if (!region) {
    throw new Error(
      'Não há regiões cadastradas. Rode `npm run seed` antes de criar um aluno.',
    );
  }

  return region;
}

/*
 * Tudo dentro de uma transação: se o vínculo de professor/aluno falhar, o
 * usuário não fica órfão no banco.
 */
async function createUser(ds: DataSource, options: Options): Promise<void> {
  await ds.transaction(async (manager) => {
    const userRepository = manager.getRepository(UserEntity);
    const existing = await userRepository.findOneBy({ email: options.email });

    if (existing) {
      throw new Error(
        `Já existe um usuário com o e-mail ${options.email} (papel: ${existing.role})`,
      );
    }

    /* Resolvido antes de gravar qualquer coisa, porque pode não existir */
    const region =
      options.role === 'student'
        ? await resolveRegion(manager, options.region)
        : null;

    const user = await userRepository.save(
      userRepository.create({
        name: options.name,
        email: options.email,
        password: await hash(options.password),
        role: options.role,
      }),
    );

    if (options.role === 'professor') {
      const teacherRepository = manager.getRepository(TeacherEntity);
      await teacherRepository.save(
        teacherRepository.create({ user, bio: null, subjects: [] }),
      );
    }

    if (region) {
      const studentRepository = manager.getRepository(StudentEntity);
      await studentRepository.save(
        studentRepository.create({
          user,
          region,
          phone: options.phone ?? DEFAULT_PHONE,
          address: null,
          active: true,
        }),
      );

      console.log(`Região do aluno: ${region.name} (${region.slug})`);
    }

    console.log('Usuário criado:');
    console.log(`  id:    ${user.id}`);
    console.log(`  nome:  ${user.name}`);
    console.log(`  email: ${user.email}`);
    console.log(`  papel: ${user.role}`);
  });
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    return;
  }

  const options = parseOptions(process.argv.slice(2));
  const ds = await dataSource.initialize();

  try {
    await createUser(ds, options);
  } finally {
    await ds.destroy();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
