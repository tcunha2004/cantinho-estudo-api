import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import dataSource from '../data-source';
import { UserEntity, UserRole } from '../../../users/entity/user.entity';
import { RegionEntity } from '../../../regions/entity/region.entity';
import { PlanEntity } from '../../../plans/entity/plan.entity';
import { SubjectEntity } from '../../../subjects/entity/subject.entity';
import { TeacherEntity } from '../../../teachers/entity/teacher.entity';
import { StudentEntity } from '../../../students/entity/student.entity';
import { GuardianEntity } from '../../../guardians/entity/guardian.entity';
import { StudentContractEntity } from '../../../student-contracts/entity/student-contract.entity';
import { PaymentEntity } from '../../../payments/entity/payment.entity';
import { ClassEntity } from '../../../classes/entity/class.entity';
import { InviteLinkEntity } from '../../../invite-links/entity/invite-link.entity';
import { PlanType } from '../../../plans/enums/plan-type.enum';
import { Frequency } from '../../../plans/enums/frequency.enum';
import { ContractStatus } from '../../../student-contracts/enums/contract-status.enum';
import { PaymentStatus } from '../../../payments/enums/payment-status.enum';
import { ClassStatus } from '../../../classes/enums/class-status.enum';
import { LocationType } from '../../../classes/enums/location-type.enum';
import { TargetRole } from '../../../invite-links/enums/target-role.enum';

/*
 * Seed de dados fictícios do Cantinho do Estudo.
 *
 * Apaga tudo (TRUNCATE) e recria a base inteira de forma determinística — o
 * gerador pseudoaleatório tem semente fixa, então rodar duas vezes produz os
 * mesmos dados (só os ids uuid mudam). As datas são relativas ao dia da
 * execução, para que os endpoints de dashboard (aulas de hoje, receita do mês,
 * aulas da semana) sempre tenham conteúdo.
 */

/* ------------------------------------------------------------------ *
 * Configuração
 * ------------------------------------------------------------------ */

const ADMIN = {
  name: 'Thiago Cunha',
  email: 'tcunha2004@gmail.com',
  password: 'Nanum2004',
};

/* Senha de todos os usuários fictícios (professores e alunos) */
const FAKE_PASSWORD = 'Senha123';

/* Quantos meses de histórico de aulas/pagamentos gerar */
const HISTORY_MONTHS = 4;

/* Até quando gerar aulas futuras (agendadas) */
const FUTURE_DAYS = 21;

/* Ordem inversa das dependências — usada no TRUNCATE */
const TABLES = [
  'invite_links',
  'payments',
  'classes',
  'teacher_subjects',
  'student_contracts',
  'guardians',
  'students',
  'teachers',
  'plans',
  'subjects',
  'regions',
  'users',
];

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */

/* PRNG com semente fixa (LCG) — mantém o seed reproduzível */
let rngState = 20260731;
function random(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}

function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}

function chance(probability: number): boolean {
  return random() < probability;
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function money(value: number): string {
  return value.toFixed(2);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/* 'YYYY-MM-DD' no fuso local (colunas date) */
function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/*
 * 'YYYY-MM-DD HH:mm:ss' no fuso local (colunas timestamp without time zone).
 * Passar string evita o driver converter a Date para UTC e deslocar o horário
 * da aula em relação ao que as queries de período esperam.
 */
function toTimestampString(date: Date): string {
  return `${toDateString(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function at(date: Date, hour: number, minute = 0): Date {
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
}

function cpf(): string {
  const digits = Array.from({ length: 11 }, () => randomInt(0, 9)).join('');
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function rg(): string {
  const digits = Array.from({ length: 9 }, () => randomInt(0, 9)).join('');
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}-${digits.slice(8)}`;
}

function phone(): string {
  return `(11) 9${randomInt(1000, 9999)}-${randomInt(1000, 9999)}`;
}

function token(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 24 }, () => pick(alphabet.split(''))).join('');
}

/* ------------------------------------------------------------------ *
 * Dados base
 * ------------------------------------------------------------------ */

const REGIONS = [
  {
    name: 'Centro',
    slug: 'centro',
    enrollmentFee: 150,
    classCommission: 35,
    priceFactor: 1,
    active: true,
  },
  {
    name: 'Zona Sul',
    slug: 'zona-sul',
    enrollmentFee: 180,
    classCommission: 40,
    priceFactor: 1.15,
    active: true,
  },
  {
    name: 'Zona Norte',
    slug: 'zona-norte',
    enrollmentFee: 120,
    classCommission: 30,
    priceFactor: 0.9,
    active: true,
  },
];

/* Tabela de preços base (Centro) — as outras regiões aplicam o priceFactor */
const PLAN_TEMPLATES = [
  {
    planType: PlanType.OURO,
    frequency: Frequency.FIVE_TIMES_WEEK,
    monthlyPrice: 1200,
    hourPrice: 60,
    classesCount: 20,
    validityMonths: null,
    weekdays: [1, 2, 3, 4, 5],
  },
  {
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    monthlyPrice: 780,
    hourPrice: 65,
    classesCount: 12,
    validityMonths: null,
    weekdays: [1, 3, 5],
  },
  {
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    monthlyPrice: 560,
    hourPrice: 70,
    classesCount: 8,
    validityMonths: null,
    weekdays: [2, 4],
  },
  {
    planType: PlanType.PRATA,
    frequency: null,
    monthlyPrice: 400,
    hourPrice: 75,
    classesCount: 5,
    validityMonths: null,
    weekdays: [3],
  },
  {
    planType: PlanType.BRONZE,
    frequency: null,
    monthlyPrice: 260,
    hourPrice: 85,
    classesCount: 3,
    validityMonths: 2,
    weekdays: [6],
  },
  {
    planType: PlanType.AVULSA,
    frequency: null,
    monthlyPrice: 100,
    hourPrice: 100,
    classesCount: 1,
    validityMonths: null,
    weekdays: [5],
  },
];

const SUBJECTS = [
  'Matemática',
  'Português',
  'Física',
  'Química',
  'Biologia',
  'História',
  'Geografia',
  'Inglês',
  'Redação',
];

const TEACHERS = [
  {
    name: 'Ana Beatriz Moraes',
    email: 'ana.moraes@cantinhodoestudo.com',
    bio: 'Licenciada em Matemática pela USP, 8 anos de experiência com reforço escolar do ensino fundamental ao médio.',
    subjects: ['Matemática', 'Física'],
  },
  {
    name: 'Carlos Eduardo Lima',
    email: 'carlos.lima@cantinhodoestudo.com',
    bio: 'Mestre em Letras, especialista em preparação para redação do ENEM e vestibulares.',
    subjects: ['Português', 'Redação'],
  },
  {
    name: 'Fernanda Ribeiro',
    email: 'fernanda.ribeiro@cantinhodoestudo.com',
    bio: 'Bacharel em Química com pós em Ensino de Ciências. Aulas práticas e muitos exercícios.',
    subjects: ['Química', 'Biologia'],
  },
  {
    name: 'Rafael Nogueira',
    email: 'rafael.nogueira@cantinhodoestudo.com',
    bio: 'Historiador e professor de humanas, foco em interpretação de texto e atualidades.',
    subjects: ['História', 'Geografia'],
  },
  {
    name: 'Juliana Prado',
    email: 'juliana.prado@cantinhodoestudo.com',
    bio: 'Tradutora e professora de inglês certificada (CPE), aulas conversacionais.',
    subjects: ['Inglês', 'Português'],
  },
  {
    name: 'Marcos Vinícius Alves',
    email: 'marcos.alves@cantinhodoestudo.com',
    bio: 'Engenheiro de formação, dá aulas de exatas há 5 anos com foco em olimpíadas escolares.',
    subjects: ['Matemática', 'Física', 'Química'],
  },
];

interface StudentSeed {
  name: string;
  email: string;
  region: string;
  address: string | null;
  active: boolean;
  planType: PlanType;
  frequency: Frequency | null;
  /* Meses atrás em que o contrato começou */
  startedMonthsAgo: number;
  contractStatus: ContractStatus;
  discountPercentage: number | null;
  subjects: string[];
  guardians: { name: string; financial: boolean }[];
}

const STUDENTS: StudentSeed[] = [
  {
    name: 'Lucas Ferreira Souza',
    email: 'lucas.souza@example.com',
    region: 'centro',
    address: null,
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    startedMonthsAgo: 6,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Matemática', 'Física'],
    guardians: [
      { name: 'Patrícia Ferreira Souza', financial: true },
      { name: 'Roberto Souza', financial: false },
    ],
  },
  {
    name: 'Maria Clara Dias',
    email: 'maria.dias@example.com',
    region: 'zona-sul',
    address: 'Rua Joaquim Nabuco, 421 — Brooklin',
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.FIVE_TIMES_WEEK,
    startedMonthsAgo: 5,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: 10,
    subjects: ['Português', 'Redação', 'História'],
    guardians: [{ name: 'Simone Dias', financial: true }],
  },
  {
    name: 'Pedro Henrique Barros',
    email: 'pedro.barros@example.com',
    region: 'zona-norte',
    address: 'Av. Água Fria, 1210 — Santana',
    active: true,
    planType: PlanType.PRATA,
    frequency: null,
    startedMonthsAgo: 3,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Matemática'],
    guardians: [{ name: 'Eliane Barros', financial: true }],
  },
  {
    name: 'Beatriz Almeida Rocha',
    email: 'beatriz.rocha@example.com',
    region: 'centro',
    address: null,
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    startedMonthsAgo: 4,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Química', 'Biologia'],
    guardians: [{ name: 'Vanessa Almeida', financial: true }],
  },
  {
    name: 'Gabriel Martins Costa',
    email: 'gabriel.costa@example.com',
    region: 'zona-sul',
    address: null,
    active: true,
    planType: PlanType.BRONZE,
    frequency: null,
    startedMonthsAgo: 1,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Inglês'],
    guardians: [{ name: 'Cláudia Martins', financial: true }],
  },
  {
    name: 'Isabela Nunes Teixeira',
    email: 'isabela.teixeira@example.com',
    region: 'centro',
    address: 'Rua Aurora, 88 — Santa Ifigênia',
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    startedMonthsAgo: 7,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: 5,
    subjects: ['Matemática', 'Português'],
    guardians: [
      { name: 'Márcia Nunes', financial: false },
      { name: 'Jorge Teixeira', financial: true },
    ],
  },
  {
    name: 'Enzo Gabriel Pereira',
    email: 'enzo.pereira@example.com',
    region: 'zona-norte',
    address: null,
    active: true,
    planType: PlanType.PRATA,
    frequency: null,
    startedMonthsAgo: 2,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['História', 'Geografia'],
    guardians: [{ name: 'Renata Pereira', financial: true }],
  },
  {
    name: 'Sophia Carvalho Lima',
    email: 'sophia.lima@example.com',
    region: 'zona-sul',
    address: 'Rua dos Pinheiros, 733 — Pinheiros',
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    startedMonthsAgo: 5,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Física', 'Matemática'],
    guardians: [{ name: 'Adriana Carvalho', financial: true }],
  },
  {
    name: 'Miguel Santos Oliveira',
    email: 'miguel.oliveira@example.com',
    region: 'centro',
    address: null,
    active: true,
    planType: PlanType.AVULSA,
    frequency: null,
    startedMonthsAgo: 2,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Redação'],
    guardians: [{ name: 'Fabiana Santos', financial: true }],
  },
  {
    name: 'Helena Ribeiro Campos',
    email: 'helena.campos@example.com',
    region: 'zona-norte',
    address: 'Rua Voluntários da Pátria, 2540 — Santana',
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    startedMonthsAgo: 4,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: 15,
    subjects: ['Biologia', 'Química'],
    guardians: [{ name: 'Luciana Campos', financial: true }],
  },
  {
    name: 'Arthur Mendes Fonseca',
    email: 'arthur.fonseca@example.com',
    region: 'centro',
    address: null,
    active: true,
    planType: PlanType.PRATA,
    frequency: null,
    startedMonthsAgo: 6,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Inglês', 'Português'],
    guardians: [{ name: 'Sandra Mendes', financial: true }],
  },
  {
    name: 'Laura Vasconcelos Pinto',
    email: 'laura.pinto@example.com',
    region: 'zona-sul',
    address: null,
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.FIVE_TIMES_WEEK,
    startedMonthsAgo: 3,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Matemática', 'Física', 'Química'],
    guardians: [
      { name: 'Rodrigo Pinto', financial: true },
      { name: 'Tatiane Vasconcelos', financial: false },
    ],
  },
  {
    name: 'Bernardo Azevedo Cruz',
    email: 'bernardo.cruz@example.com',
    region: 'zona-norte',
    address: 'Av. Engenheiro Caetano Álvares, 900 — Casa Verde',
    active: true,
    planType: PlanType.BRONZE,
    frequency: null,
    startedMonthsAgo: 3,
    contractStatus: ContractStatus.EXPIRED,
    discountPercentage: null,
    subjects: ['Geografia'],
    guardians: [{ name: 'Priscila Azevedo', financial: true }],
  },
  {
    name: 'Alice Monteiro Farias',
    email: 'alice.farias@example.com',
    region: 'centro',
    address: null,
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    startedMonthsAgo: 8,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Português', 'Redação'],
    guardians: [{ name: 'Denise Monteiro', financial: true }],
  },
  {
    name: 'Theo Cardoso Batista',
    email: 'theo.batista@example.com',
    region: 'zona-sul',
    address: 'Rua Gomes de Carvalho, 155 — Vila Olímpia',
    active: true,
    planType: PlanType.PRATA,
    frequency: null,
    startedMonthsAgo: 1,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: 20,
    subjects: ['Matemática'],
    guardians: [{ name: 'Camila Cardoso', financial: true }],
  },
  {
    name: 'Manuela Freitas Andrade',
    email: 'manuela.andrade@example.com',
    region: 'zona-norte',
    address: null,
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    startedMonthsAgo: 5,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['História', 'Inglês'],
    guardians: [{ name: 'Aline Freitas', financial: true }],
  },
  {
    name: 'Davi Lucca Ramos',
    email: 'davi.ramos@example.com',
    region: 'centro',
    address: null,
    active: false,
    planType: PlanType.PRATA,
    frequency: null,
    startedMonthsAgo: 7,
    contractStatus: ContractStatus.CANCELLED,
    discountPercentage: null,
    subjects: ['Matemática', 'Biologia'],
    guardians: [{ name: 'Marcelo Ramos', financial: true }],
  },
  {
    name: 'Cecília Duarte Moreira',
    email: 'cecilia.moreira@example.com',
    region: 'zona-sul',
    address: null,
    active: false,
    planType: PlanType.BRONZE,
    frequency: null,
    startedMonthsAgo: 6,
    contractStatus: ContractStatus.EXPIRED,
    discountPercentage: null,
    subjects: ['Química'],
    guardians: [{ name: 'Bruna Duarte', financial: true }],
  },
  {
    name: 'Noah Siqueira Barbosa',
    email: 'noah.barbosa@example.com',
    region: 'centro',
    address: 'Rua Maria Antônia, 310 — Vila Buarque',
    active: true,
    planType: PlanType.AVULSA,
    frequency: null,
    startedMonthsAgo: 1,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Física'],
    guardians: [{ name: 'Elaine Siqueira', financial: true }],
  },
  {
    name: 'Valentina Rezende Pires',
    email: 'valentina.pires@example.com',
    region: 'zona-norte',
    address: null,
    active: true,
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    startedMonthsAgo: 2,
    contractStatus: ContractStatus.ACTIVE,
    discountPercentage: null,
    subjects: ['Redação', 'Geografia'],
    guardians: [{ name: 'Michele Rezende', financial: true }],
  },
];

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

async function hash(password: string): Promise<string> {
  const configured = Number(process.env.BCRYPT_SALT_ROUNDS);
  const rounds =
    Number.isInteger(configured) && configured > 0 ? configured : 10;
  return bcrypt.hash(password, rounds);
}

async function truncateAll(ds: DataSource): Promise<void> {
  await ds.query(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} CASCADE`,
  );
}

async function seed(ds: DataSource): Promise<void> {
  const now = new Date();
  const today = at(now, 0);

  /* ---------------- regiões ---------------- */

  const regionRepository = ds.getRepository(RegionEntity);
  const regions = await regionRepository.save(
    REGIONS.map((region) =>
      regionRepository.create({
        name: region.name,
        slug: region.slug,
        enrollmentFee: money(region.enrollmentFee),
        classCommission: money(region.classCommission),
        active: region.active,
      }),
    ),
  );
  const regionBySlug = new Map(regions.map((region) => [region.slug, region]));

  /* ---------------- planos (um conjunto por região) ---------------- */

  const planRepository = ds.getRepository(PlanEntity);
  const plans = await planRepository.save(
    REGIONS.flatMap((regionSeed) =>
      PLAN_TEMPLATES.map((template) => {
        const region = regionBySlug.get(regionSeed.slug)!;
        return planRepository.create({
          region,
          planType: template.planType,
          frequency: template.frequency,
          monthlyPrice: money(template.monthlyPrice * regionSeed.priceFactor),
          hourPrice: money(template.hourPrice * regionSeed.priceFactor),
          classesCount: template.classesCount,
          validityMonths: template.validityMonths,
        });
      }),
    ),
  );

  const planKey = (
    regionSlug: string,
    planType: PlanType,
    frequency: Frequency | null,
  ) => `${regionSlug}|${planType}|${frequency ?? 'null'}`;

  const planByKey = new Map(
    plans.map((plan) => [
      planKey(
        regions.find((region) => region.id === plan.region.id)!.slug,
        plan.planType,
        plan.frequency,
      ),
      plan,
    ]),
  );

  /* ---------------- disciplinas ---------------- */

  const subjectRepository = ds.getRepository(SubjectEntity);
  const subjects = await subjectRepository.save(
    SUBJECTS.map((name) => subjectRepository.create({ name })),
  );
  const subjectByName = new Map(
    subjects.map((subject) => [subject.name, subject]),
  );

  /* ---------------- usuários ---------------- */

  const userRepository = ds.getRepository(UserEntity);
  const fakePasswordHash = await hash(FAKE_PASSWORD);

  const createUser = (name: string, email: string, role: UserRole) =>
    userRepository.create({
      name,
      email,
      password: fakePasswordHash,
      role,
    });

  const admin = await userRepository.save(
    userRepository.create({
      name: ADMIN.name,
      email: ADMIN.email,
      password: await hash(ADMIN.password),
      role: 'admin',
    }),
  );

  const secondaryAdmin = await userRepository.save(
    createUser(
      'Coordenação Cantinho',
      'coordenacao@cantinhodoestudo.com',
      'admin',
    ),
  );

  /* ---------------- professores ---------------- */

  const teacherRepository = ds.getRepository(TeacherEntity);
  const teachers: TeacherEntity[] = [];

  for (const teacherSeed of TEACHERS) {
    const user = await userRepository.save(
      createUser(teacherSeed.name, teacherSeed.email, 'professor'),
    );
    const teacher = await teacherRepository.save(
      teacherRepository.create({
        user,
        bio: teacherSeed.bio,
        subjects: teacherSeed.subjects.map((name) => subjectByName.get(name)!),
      }),
    );
    teachers.push(teacher);
  }

  /* Professores habilitados em cada disciplina */
  const teachersBySubject = new Map<string, TeacherEntity[]>();
  TEACHERS.forEach((teacherSeed, index) => {
    for (const subjectName of teacherSeed.subjects) {
      const list = teachersBySubject.get(subjectName) ?? [];
      list.push(teachers[index]);
      teachersBySubject.set(subjectName, list);
    }
  });

  /* ---------------- alunos, responsáveis, contratos ---------------- */

  const studentRepository = ds.getRepository(StudentEntity);
  const guardianRepository = ds.getRepository(GuardianEntity);
  const contractRepository = ds.getRepository(StudentContractEntity);
  const paymentRepository = ds.getRepository(PaymentEntity);
  const classRepository = ds.getRepository(ClassEntity);

  let totalGuardians = 0;
  let totalPayments = 0;
  const allClasses: ClassEntity[] = [];

  for (const studentSeed of STUDENTS) {
    const region = regionBySlug.get(studentSeed.region)!;
    const regionSeed = REGIONS.find(
      (item) => item.slug === studentSeed.region,
    )!;

    const user = await userRepository.save(
      createUser(studentSeed.name, studentSeed.email, 'student'),
    );

    const student = await studentRepository.save(
      studentRepository.create({
        user,
        region,
        phone: phone(),
        address: studentSeed.address,
        active: studentSeed.active,
      }),
    );

    await guardianRepository.save(
      studentSeed.guardians.map((guardianSeed) =>
        guardianRepository.create({
          student,
          name: guardianSeed.name,
          phone: phone(),
          cpf: cpf(),
          rg: chance(0.8) ? rg() : null,
          isFinancialResponsible: guardianSeed.financial,
        }),
      ),
    );
    totalGuardians += studentSeed.guardians.length;

    const plan = planByKey.get(
      planKey(studentSeed.region, studentSeed.planType, studentSeed.frequency),
    )!;
    const template = PLAN_TEMPLATES.find(
      (item) =>
        item.planType === studentSeed.planType &&
        item.frequency === studentSeed.frequency,
    )!;

    const startDate = at(
      new Date(
        now.getFullYear(),
        now.getMonth() - studentSeed.startedMonthsAgo,
        randomInt(1, 12),
      ),
      0,
    );

    /* Bronze tem validade de 2 meses; os outros planos são contínuos */
    const endDate = template.validityMonths
      ? at(addMonths(startDate, template.validityMonths), 0)
      : studentSeed.contractStatus === ContractStatus.CANCELLED
        ? at(addMonths(startDate, 3), 0)
        : null;

    const contract = await contractRepository.save(
      contractRepository.create({
        student,
        plan,
        startDate: toDateString(startDate),
        endDate: endDate ? toDateString(endDate) : null,
        discountPercentage: studentSeed.discountPercentage
          ? money(studentSeed.discountPercentage)
          : null,
        status: studentSeed.contractStatus,
      }),
    );

    const discount = (studentSeed.discountPercentage ?? 0) / 100;

    /* ---------------- pagamentos (mensalidades) ---------------- */

    /* Última competência cobrada: fim do contrato, se houver, ou o mês atual */
    const lastBilled = endDate && endDate < today ? endDate : today;
    const payments: PaymentEntity[] = [];
    let overdueUsed = false;

    for (
      let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
      cursor <= new Date(lastBilled.getFullYear(), lastBilled.getMonth(), 1);
      cursor = addMonths(cursor, 1)
    ) {
      const dueDate = at(
        new Date(cursor.getFullYear(), cursor.getMonth(), 10),
        0,
      );
      const amount = Number(plan.monthlyPrice) * (1 - discount);
      const isCurrentMonth =
        dueDate.getFullYear() === today.getFullYear() &&
        dueDate.getMonth() === today.getMonth();

      let status: PaymentStatus;
      let paidAt: string | null = null;

      if (
        studentSeed.contractStatus === ContractStatus.CANCELLED &&
        isCurrentMonth
      ) {
        status = PaymentStatus.CANCELLED;
      } else if (isCurrentMonth) {
        /* Mês corrente: metade já pagou, metade em aberto */
        if (chance(0.5) && dueDate <= today) {
          status = PaymentStatus.PAID;
          paidAt = toTimestampString(
            at(addDays(dueDate, -randomInt(0, 4)), randomInt(9, 18)),
          );
        } else {
          status = PaymentStatus.PENDING;
        }
      } else if (!overdueUsed && chance(0.12)) {
        /* Uma inadimplência ocasional no histórico */
        status = PaymentStatus.OVERDUE;
        overdueUsed = true;
      } else {
        status = PaymentStatus.PAID;
        paidAt = toTimestampString(
          at(addDays(dueDate, randomInt(-5, 3)), randomInt(9, 19)),
        );
      }

      payments.push(
        paymentRepository.create({
          studentContract: contract,
          amount: money(amount),
          dueDate: toDateString(dueDate),
          paidAt,
          status,
        }),
      );
    }

    await paymentRepository.save(payments);
    totalPayments += payments.length;

    /* ---------------- aulas ---------------- */

    /* Só geramos histórico dos últimos HISTORY_MONTHS meses */
    const historyStart = at(addMonths(today, -HISTORY_MONTHS), 0);
    const classesStart = startDate > historyStart ? startDate : historyStart;
    const classesEnd =
      endDate && endDate < addDays(today, FUTURE_DAYS)
        ? endDate
        : studentSeed.contractStatus === ContractStatus.ACTIVE &&
            studentSeed.active
          ? addDays(today, FUTURE_DAYS)
          : today;

    const hourPrice = Number(plan.hourPrice);
    const commissionPerHour = regionSeed.classCommission;
    const classes: ClassEntity[] = [];

    for (
      let day = new Date(classesStart);
      day <= classesEnd;
      day = addDays(day, 1)
    ) {
      const weekday = day.getDay();
      if (!template.weekdays.includes(weekday)) continue;

      /* Avulsa: aula esporádica, não toda semana */
      if (studentSeed.planType === PlanType.AVULSA && !chance(0.4)) continue;

      const subjectName = pick(studentSeed.subjects);
      const subject = subjectByName.get(subjectName)!;
      const teacher = pick(teachersBySubject.get(subjectName)!);

      const durationMinutes = chance(0.75) ? 60 : chance(0.6) ? 90 : 120;
      const scheduledAt = at(day, randomInt(8, 19), chance(0.5) ? 0 : 30);
      const isPast = scheduledAt < now;

      const locationType = studentSeed.address
        ? chance(0.7)
          ? LocationType.HOME
          : LocationType.SCHOOL
        : LocationType.SCHOOL;

      let status: ClassStatus;
      if (!isPast) {
        status = ClassStatus.SCHEDULED;
      } else if (chance(0.87)) {
        status = ClassStatus.COMPLETED;
      } else if (chance(0.6)) {
        status = ClassStatus.CANCELLED;
      } else {
        status = ClassStatus.NO_SHOW;
      }

      const hours = durationMinutes / 60;
      const completed = status === ClassStatus.COMPLETED;

      classes.push(
        classRepository.create({
          studentContract: contract,
          teacher,
          subject,
          /* Região e valores só são congelados quando a aula é concluída */
          region: completed ? region : null,
          scheduledAt: toTimestampString(scheduledAt),
          durationMinutes,
          locationType,
          status,
          commissionAmount: completed ? money(commissionPerHour * hours) : null,
          amountCharged: completed
            ? money(hourPrice * hours * (1 - discount))
            : null,
          notes: completed && chance(0.25) ? pick(CLASS_NOTES) : null,
        }),
      );
    }

    await classRepository.save(classes, { chunk: 200 });
    allClasses.push(...classes);
  }

  /* ---------------- aulas de hoje ainda por acontecer ---------------- */

  /*
   * Garante conteúdo em GET /classes/today/upcoming independentemente da hora
   * em que o seed rodar: três aulas hoje, à frente do horário atual.
   *
   * O endpoint compara scheduled_at (timestamp sem fuso, gravado em hora local)
   * com now.toISOString() — ou seja, com o horário já convertido para UTC. Na
   * prática o corte acontece em "agora + offset do fuso", então as aulas são
   * posicionadas depois desse corte para de fato aparecerem na listagem.
   */
  const activeContracts = await contractRepository.find({
    where: { status: ContractStatus.ACTIVE },
    relations: { student: { region: true, user: true }, plan: true },
  });

  const cutoff = new Date(now.getTime() + now.getTimezoneOffset() * 60 * 1000);

  const todayClasses: ClassEntity[] = [];
  for (let index = 0; index < 3; index += 1) {
    const contract = activeContracts[index % activeContracts.length];
    const studentSeed = STUDENTS.find(
      (item) => item.email === contract.student.user.email,
    )!;
    const subjectName = pick(studentSeed.subjects);
    const scheduledAt = new Date(
      cutoff.getTime() + (45 + index * 60) * 60 * 1000,
    );

    todayClasses.push(
      classRepository.create({
        studentContract: contract,
        teacher: pick(teachersBySubject.get(subjectName)!),
        subject: subjectByName.get(subjectName)!,
        region: null,
        scheduledAt: toTimestampString(scheduledAt),
        durationMinutes: 60,
        locationType: studentSeed.address
          ? LocationType.HOME
          : LocationType.SCHOOL,
        status: ClassStatus.SCHEDULED,
        commissionAmount: null,
        amountCharged: null,
        notes: null,
      }),
    );
  }
  await classRepository.save(todayClasses);
  allClasses.push(...todayClasses);

  /* ---------------- links de convite ---------------- */

  const inviteRepository = ds.getRepository(InviteLinkEntity);
  const invites = await inviteRepository.save([
    inviteRepository.create({
      createdBy: admin,
      token: token(),
      targetRole: TargetRole.STUDENT,
      discountPercentage: money(10),
      expiresAt: toTimestampString(at(addDays(today, 15), 23, 59)),
      used: false,
    }),
    inviteRepository.create({
      createdBy: admin,
      token: token(),
      targetRole: TargetRole.STUDENT,
      discountPercentage: null,
      expiresAt: toTimestampString(at(addDays(today, 7), 23, 59)),
      used: false,
    }),
    inviteRepository.create({
      createdBy: admin,
      token: token(),
      targetRole: TargetRole.PROFESSOR,
      discountPercentage: null,
      expiresAt: toTimestampString(at(addDays(today, 30), 23, 59)),
      used: false,
    }),
    inviteRepository.create({
      createdBy: secondaryAdmin,
      token: token(),
      targetRole: TargetRole.STUDENT,
      discountPercentage: money(20),
      expiresAt: toTimestampString(at(addDays(today, -3), 23, 59)),
      used: true,
    }),
  ]);

  /* ---------------- resumo ---------------- */

  const completed = allClasses.filter(
    (item) => item.status === ClassStatus.COMPLETED,
  );

  console.log('');
  console.log('Seed concluído:');
  console.log(`  regiões............. ${regions.length}`);
  console.log(`  planos.............. ${plans.length}`);
  console.log(`  disciplinas......... ${subjects.length}`);
  console.log(
    `  usuários............ ${2 + TEACHERS.length + STUDENTS.length}`,
  );
  console.log(`  professores......... ${teachers.length}`);
  console.log(`  alunos.............. ${STUDENTS.length}`);
  console.log(`  responsáveis........ ${totalGuardians}`);
  console.log(`  contratos........... ${STUDENTS.length}`);
  console.log(`  pagamentos.......... ${totalPayments}`);
  console.log(
    `  aulas............... ${allClasses.length} (${completed.length} concluídas)`,
  );
  console.log(`  links de convite.... ${invites.length}`);
  console.log('');
  console.log(`Admin: ${ADMIN.email} / ${ADMIN.password}`);
  console.log(`Demais usuários: senha ${FAKE_PASSWORD}`);
  console.log('');
}

const CLASS_NOTES = [
  'Aluno evoluiu bem nos exercícios de fixação.',
  'Revisão para a prova bimestral.',
  'Ficou de dever de casa a lista 3.',
  'Aluno chegou 10 minutos atrasado.',
  'Conteúdo novo introduzido, precisa reforço na próxima aula.',
  'Simulado corrigido em aula.',
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('O seed não pode ser executado em produção');
  }

  const ds = await dataSource.initialize();

  try {
    console.log('Limpando as tabelas...');
    await truncateAll(ds);
    console.log('Populando o banco...');
    await seed(ds);
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
