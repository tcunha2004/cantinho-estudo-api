import 'dotenv/config';
import { DataSource } from 'typeorm';
import dataSource from '../data-source';
import { UserEntity } from '../../../users/entity/user.entity';
import { RegionEntity } from '../../../regions/entity/region.entity';
import { PlanEntity } from '../../../plans/entity/plan.entity';
import { SubjectEntity } from '../../../subjects/entity/subject.entity';
import { TeacherEntity } from '../../../teachers/entity/teacher.entity';
import { StudentEntity } from '../../../students/entity/student.entity';
import { StudentContractEntity } from '../../../student-contracts/entity/student-contract.entity';
import { PaymentEntity } from '../../../payments/entity/payment.entity';
import { PlanType } from '../../../plans/enums/plan-type.enum';
import { Frequency } from '../../../plans/enums/frequency.enum';
import { ContractStatus } from '../../../student-contracts/enums/contract-status.enum';
import { PaymentStatus } from '../../../payments/enums/payment-status.enum';
import { hashPassword, money, toDateString } from './helpers';

/*
 * Seed principal do Cantinho do Estudo.
 *
 * Dá TRUNCATE em tudo e recria só o essencial para começar a usar o sistema:
 * o catálogo (matérias, regiões, planos) e as 3 contas de teste, cada uma já
 * com o mínimo para navegar nas telas do seu papel. Não cria professores,
 * alunos ou aulas fictícios em massa — para isso, veja os seeds especializados
 * (`user:create`, `subject:create`, `contract:create`, `classes:create`), cada
 * um com instruções de uso no início do próprio arquivo.
 *
 *   npm run seed
 *
 * Rodar de novo sempre apaga tudo e recomeça do mesmo jeito (só os uuids
 * mudam) — é seguro repetir a qualquer momento durante o desenvolvimento.
 */

/* ------------------------------------------------------------------ *
 * Configuração
 * ------------------------------------------------------------------ */

const TEST_ACCOUNTS_PASSWORD = 'teste123';

const CANTINHO_REGION_SLUG = 'cantinho';
const VILA_DA_SERRA_SLUG = 'vila-da-serra';

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

/* Dia do vencimento das mensalidades — o mesmo usado por contract:create */
const DUE_DAY = 10;

/* Catálogo escolar padrão */
const SUBJECTS = [
  'Matemática',
  'Português',
  'Redação',
  'Física',
  'Química',
  'Biologia',
  'História',
  'Geografia',
  'Inglês',
  'Filosofia',
  'Sociologia',
  'Artes',
];

/* Tabela comercial vigente — ver PRECIFICACAO-POR-REGIAO.md */
const REGIONS = [
  {
    name: 'Vila da Serra',
    slug: VILA_DA_SERRA_SLUG,
    enrollmentFee: 200,
    classCommission: 85,
    active: true,
  },
  {
    name: 'Centro-Sul',
    slug: 'centro-sul',
    enrollmentFee: 200,
    classCommission: 75,
    active: true,
  },
  {
    name: 'Cid. Nova e Região',
    slug: 'cidade-nova',
    enrollmentFee: 165,
    classCommission: 55,
    active: true,
  },
  {
    name: 'Cantinho',
    slug: CANTINHO_REGION_SLUG,
    enrollmentFee: 165,
    classCommission: 47,
    active: true,
  },
];

/* Tabela oficial de preços — 6 planos por região, 24 no total */
const PLANS: {
  regionSlug: string;
  planType: PlanType;
  frequency: Frequency | null;
  monthlyPrice: number;
  hourPrice: number;
  classesCount: number;
  validityMonths: number | null;
}[] = [
  {
    regionSlug: 'vila-da-serra',
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    monthlyPrice: 1320,
    hourPrice: 165,
    classesCount: 8,
    validityMonths: null,
  },
  {
    regionSlug: 'vila-da-serra',
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    monthlyPrice: 1860,
    hourPrice: 155,
    classesCount: 12,
    validityMonths: null,
  },
  {
    regionSlug: 'vila-da-serra',
    planType: PlanType.OURO,
    frequency: Frequency.FIVE_TIMES_WEEK,
    monthlyPrice: 2900,
    hourPrice: 145,
    classesCount: 20,
    validityMonths: null,
  },
  {
    regionSlug: 'vila-da-serra',
    planType: PlanType.PRATA,
    frequency: null,
    monthlyPrice: 1800,
    hourPrice: 180,
    classesCount: 10,
    validityMonths: null,
  },
  {
    regionSlug: 'vila-da-serra',
    planType: PlanType.BRONZE,
    frequency: null,
    monthlyPrice: 2000,
    hourPrice: 200,
    classesCount: 10,
    validityMonths: 2,
  },
  {
    regionSlug: 'vila-da-serra',
    planType: PlanType.AVULSA,
    frequency: null,
    monthlyPrice: 220,
    hourPrice: 220,
    classesCount: 1,
    validityMonths: null,
  },

  {
    regionSlug: 'centro-sul',
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    monthlyPrice: 1080,
    hourPrice: 135,
    classesCount: 8,
    validityMonths: null,
  },
  {
    regionSlug: 'centro-sul',
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    monthlyPrice: 1500,
    hourPrice: 125,
    classesCount: 12,
    validityMonths: null,
  },
  {
    regionSlug: 'centro-sul',
    planType: PlanType.OURO,
    frequency: Frequency.FIVE_TIMES_WEEK,
    monthlyPrice: 2300,
    hourPrice: 115,
    classesCount: 20,
    validityMonths: null,
  },
  {
    regionSlug: 'centro-sul',
    planType: PlanType.PRATA,
    frequency: null,
    monthlyPrice: 1550,
    hourPrice: 155,
    classesCount: 10,
    validityMonths: null,
  },
  {
    regionSlug: 'centro-sul',
    planType: PlanType.BRONZE,
    frequency: null,
    monthlyPrice: 1750,
    hourPrice: 175,
    classesCount: 10,
    validityMonths: 2,
  },
  {
    regionSlug: 'centro-sul',
    planType: PlanType.AVULSA,
    frequency: null,
    monthlyPrice: 200,
    hourPrice: 200,
    classesCount: 1,
    validityMonths: null,
  },

  {
    regionSlug: 'cidade-nova',
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    monthlyPrice: 760,
    hourPrice: 95,
    classesCount: 8,
    validityMonths: null,
  },
  {
    regionSlug: 'cidade-nova',
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    monthlyPrice: 1020,
    hourPrice: 85,
    classesCount: 12,
    validityMonths: null,
  },
  {
    regionSlug: 'cidade-nova',
    planType: PlanType.OURO,
    frequency: Frequency.FIVE_TIMES_WEEK,
    monthlyPrice: 1500,
    hourPrice: 75,
    classesCount: 20,
    validityMonths: null,
  },
  {
    regionSlug: 'cidade-nova',
    planType: PlanType.PRATA,
    frequency: null,
    monthlyPrice: 1100,
    hourPrice: 110,
    classesCount: 10,
    validityMonths: null,
  },
  {
    regionSlug: 'cidade-nova',
    planType: PlanType.BRONZE,
    frequency: null,
    monthlyPrice: 1250,
    hourPrice: 125,
    classesCount: 10,
    validityMonths: 2,
  },
  {
    regionSlug: 'cidade-nova',
    planType: PlanType.AVULSA,
    frequency: null,
    monthlyPrice: 150,
    hourPrice: 150,
    classesCount: 1,
    validityMonths: null,
  },

  {
    regionSlug: CANTINHO_REGION_SLUG,
    planType: PlanType.OURO,
    frequency: Frequency.TWICE_WEEK,
    monthlyPrice: 600,
    hourPrice: 75,
    classesCount: 8,
    validityMonths: null,
  },
  {
    regionSlug: CANTINHO_REGION_SLUG,
    planType: PlanType.OURO,
    frequency: Frequency.THREE_TIMES_WEEK,
    monthlyPrice: 840,
    hourPrice: 70,
    classesCount: 12,
    validityMonths: null,
  },
  {
    regionSlug: CANTINHO_REGION_SLUG,
    planType: PlanType.OURO,
    frequency: Frequency.FIVE_TIMES_WEEK,
    monthlyPrice: 1300,
    hourPrice: 65,
    classesCount: 20,
    validityMonths: null,
  },
  {
    regionSlug: CANTINHO_REGION_SLUG,
    planType: PlanType.PRATA,
    frequency: null,
    monthlyPrice: 850,
    hourPrice: 85,
    classesCount: 10,
    validityMonths: null,
  },
  {
    regionSlug: CANTINHO_REGION_SLUG,
    planType: PlanType.BRONZE,
    frequency: null,
    monthlyPrice: 900,
    hourPrice: 90,
    classesCount: 10,
    validityMonths: 2,
  },
  {
    regionSlug: CANTINHO_REGION_SLUG,
    planType: PlanType.AVULSA,
    frequency: null,
    monthlyPrice: 100,
    hourPrice: 100,
    classesCount: 1,
    validityMonths: null,
  },
];

/* ------------------------------------------------------------------ *
 * Seed
 * ------------------------------------------------------------------ */

async function truncateAll(ds: DataSource): Promise<void> {
  await ds.query(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} CASCADE`,
  );
}

async function seed(ds: DataSource): Promise<void> {
  /* ---------------- matérias ---------------- */

  const subjectRepository = ds.getRepository(SubjectEntity);
  const subjects = await subjectRepository.save(
    SUBJECTS.map((name) => subjectRepository.create({ name })),
  );
  const subjectByName = new Map(
    subjects.map((subject) => [subject.name, subject]),
  );

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
    PLANS.map((planSeed) =>
      planRepository.create({
        region: regionBySlug.get(planSeed.regionSlug)!,
        planType: planSeed.planType,
        frequency: planSeed.frequency,
        monthlyPrice: money(planSeed.monthlyPrice),
        hourPrice: money(planSeed.hourPrice),
        classesCount: planSeed.classesCount,
        validityMonths: planSeed.validityMonths,
      }),
    ),
  );

  const planKey = (
    regionSlug: string,
    planType: PlanType,
    frequency: Frequency | null,
  ) => `${regionSlug}|${planType}|${frequency ?? 'null'}`;

  const planByKey = new Map(
    plans.map((plan, index) => [
      planKey(PLANS[index].regionSlug, plan.planType, plan.frequency),
      plan,
    ]),
  );

  /* ---------------- conta admin ---------------- */

  const userRepository = ds.getRepository(UserEntity);
  const testPassword = await hashPassword(TEST_ACCOUNTS_PASSWORD);

  await userRepository.save(
    userRepository.create({
      name: 'Admin Teste',
      email: 'admin@teste.com',
      password: testPassword,
      role: 'admin',
    }),
  );

  /* ---------------- conta professor — Matemática ---------------- */

  const professorUser = await userRepository.save(
    userRepository.create({
      name: 'Professor Teste',
      email: 'prof@teste.com',
      password: testPassword,
      role: 'professor',
    }),
  );

  const teacherRepository = ds.getRepository(TeacherEntity);
  const teacher = await teacherRepository.save(
    teacherRepository.create({
      user: professorUser,
      bio: 'Conta de teste para desenvolvimento.',
      subjects: [subjectByName.get('Matemática')!],
    }),
  );

  /* ---------------- conta aluno — contrato Ouro na Vila da Serra ---------------- */

  const studentUser = await userRepository.save(
    userRepository.create({
      name: 'Aluno Teste',
      email: 'aluno@teste.com',
      password: testPassword,
      role: 'student',
    }),
  );

  const studentRepository = ds.getRepository(StudentEntity);
  const student = await studentRepository.save(
    studentRepository.create({
      user: studentUser,
      region: regionBySlug.get(VILA_DA_SERRA_SLUG)!,
      phone: '(31) 90000-0000',
      address: null,
      active: true,
    }),
  );

  const ouroPlan = planByKey.get(
    planKey(VILA_DA_SERRA_SLUG, PlanType.OURO, Frequency.THREE_TIMES_WEEK),
  )!;

  const contractRepository = ds.getRepository(StudentContractEntity);
  const contractStart = new Date();
  contractStart.setDate(1);

  /* Ouro e Prata vigoram até dezembro do ano em que começam */
  const contract = await contractRepository.save(
    contractRepository.create({
      student,
      plan: ouroPlan,
      startDate: toDateString(contractStart),
      endDate: `${contractStart.getFullYear()}-12-31`,
      discountPercentage: null,
      status: ContractStatus.ACTIVE,
    }),
  );

  /*
   * Uma mensalidade em aberto para o mês corrente — sem ela a tela financeira
   * do aluno nasce vazia. O valor é a mensalidade do plano, fixa: o aluno paga
   * o plano, não as aulas que fez.
   */
  const paymentRepository = ds.getRepository(PaymentEntity);
  await paymentRepository.save(
    paymentRepository.create({
      studentContract: contract,
      amount: ouroPlan.monthlyPrice,
      dueDate: toDateString(
        new Date(
          contractStart.getFullYear(),
          contractStart.getMonth(),
          DUE_DAY,
        ),
      ),
      paidAt: null,
      status: PaymentStatus.PENDING,
    }),
  );

  console.log('');
  console.log(`Matérias............ ${subjects.length}`);
  console.log(`Regiões.............. ${regions.length}`);
  console.log(`Planos............... ${plans.length}`);
  console.log('');
  console.log(`Contas de teste (senha: ${TEST_ACCOUNTS_PASSWORD}):`);
  console.log('  admin@teste.com');
  console.log(
    `  prof@teste.com  — vinculado a Matemática (teacher_id ${teacher.id})`,
  );
  console.log(
    `  aluno@teste.com — região Vila da Serra, contrato Ouro 3x/semana (contract_id ${contract.id})`,
  );
  console.log('');
}

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
