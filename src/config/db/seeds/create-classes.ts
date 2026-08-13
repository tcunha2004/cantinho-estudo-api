import 'dotenv/config';
import { DataSource, EntityManager, In } from 'typeorm';
import dataSource from '../data-source';
import { TeacherEntity } from '../../../teachers/entity/teacher.entity';
import { SubjectEntity } from '../../../subjects/entity/subject.entity';
import { StudentContractEntity } from '../../../student-contracts/entity/student-contract.entity';
import { ClassEntity } from '../../../classes/entity/class.entity';
import { PlanEntity } from '../../../plans/entity/plan.entity';
import { RegionEntity } from '../../../regions/entity/region.entity';
import { ContractStatus } from '../../../student-contracts/enums/contract-status.enum';
import {
  BILLABLE_STATUSES,
  ClassStatus,
} from '../../../classes/enums/class-status.enum';
import { LocationType } from '../../../classes/enums/location-type.enum';
import { PaymentEntity } from '../../../payments/entity/payment.entity';
import {
  addDays,
  at,
  money,
  parseArgs,
  resolveTeacher,
  toDateString,
  toTimestampString,
  withDataSource,
} from './helpers';

/*
 * Aula no Cantinho sempre usa a tabela desta região, não a do bairro do aluno
 * — mesma constante usada em ClassesService e no seed.
 */
const CANTINHO_REGION_SLUG = 'cantinho';

/*
 * Cria aulas para um professor já existente, sem apagar nada — ao contrário do
 * seed, que dá TRUNCATE em tudo. Serve para popular as telas do professor
 * (próximas aulas, histórico, ganhos do mês) durante o desenvolvimento.
 *
 *   npm run classes:create -- --teacher 0f3c...c81
 *   npm run classes:create -- --email ana.moraes@cantinhodoestudo.com
 *
 * Por padrão gera 10 aulas nos últimos 15 dias (concluídas, canceladas ou
 * no_show) e 10 nos próximos 15 dias (agendadas), uma por dia, espalhadas ao
 * longo da janela.
 *
 * As aulas passadas concluídas congelam região, comissão e valor cobrado do
 * mesmo jeito que o seed — sem isso a receita do mês e os ganhos do professor
 * ficam zerados.
 *
 * Os alunos vêm dos contratos ativos já cadastrados (round-robin), e as
 * disciplinas, das que o professor dá aula. Rodar duas vezes soma aulas, não
 * substitui.
 *
 * Flags:
 *   --teacher <uuid>  id do professor (aceita o id em `teachers` ou o user_id)
 *   --email <email>   alternativa ao --teacher: acha o professor pelo e-mail
 *   --past <n>        quantas aulas passadas (padrão: 10)
 *   --future <n>      quantas aulas futuras (padrão: 10)
 *   --days <n>        tamanho da janela em dias, para cada lado (padrão: 15)
 */

const DEFAULT_PAST = 10;
const DEFAULT_FUTURE = 10;
const DEFAULT_DAYS = 15;

const USAGE = `
Uso:
  npm run classes:create -- --teacher <uuid>
  npm run classes:create -- --email <email do professor>

Opcionais:
  --past <n>    quantas aulas passadas (padrão: ${DEFAULT_PAST})
  --future <n>  quantas aulas futuras (padrão: ${DEFAULT_FUTURE})
  --days <n>    janela em dias para cada lado (padrão: ${DEFAULT_DAYS})

Exemplos:
  npm run classes:create -- --teacher 8f14e45f-ceea-467a-9d1b-1a0f9b6b5c21
  npm run classes:create -- --email ana.moraes@cantinhodoestudo.com --past 6 --future 4
  npm run classes:create -- --teacher 8f14e45f-ceea-467a-9d1b-1a0f9b6b5c21 --days 30
`.trim();

interface Options {
  teacher?: string;
  email?: string;
  past: number;
  future: number;
  days: number;
}

/* ------------------------------------------------------------------ *
 * Argumentos
 * ------------------------------------------------------------------ */

function parseCount(
  raw: string | undefined,
  fallback: number,
  flag: string,
  min: number,
): number {
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min) {
    throw new Error(`--${flag} precisa ser um número inteiro >= ${min}`);
  }

  return value;
}

function parseOptions(argv: string[]): Options {
  const args = parseArgs(argv);

  if (!args.teacher && !args.email) {
    throw new Error(`Informe --teacher ou --email\n\n${USAGE}`);
  }

  const options: Options = {
    teacher: args.teacher,
    email: args.email?.toLowerCase(),
    past: parseCount(args.past, DEFAULT_PAST, 'past', 0),
    future: parseCount(args.future, DEFAULT_FUTURE, 'future', 0),
    days: parseCount(args.days, DEFAULT_DAYS, 'days', 1),
  };

  if (options.past === 0 && options.future === 0) {
    throw new Error('Nada a fazer: --past e --future são zero');
  }

  return options;
}

/* ------------------------------------------------------------------ *
 * Utilidades específicas deste script
 * ------------------------------------------------------------------ */

/* PRNG com semente fixa (LCG) — mantém a geração reproduzível */
let rngState = 20260803;
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

const CLASS_NOTES = [
  'Aluno evoluiu bem nos exercícios de fixação.',
  'Revisão para a prova bimestral.',
  'Ficou de dever de casa a lista 3.',
  'Aluno chegou 10 minutos atrasado.',
  'Conteúdo novo introduzido, precisa reforço na próxima aula.',
  'Simulado corrigido em aula.',
];

/*
 * Distribui `count` aulas ao longo de `days` dias, do dia 1 ao dia `days`.
 * Enquanto count <= days cada aula cai num dia diferente; acima disso, dias
 * repetidos (com horários diferentes).
 */
function spreadDayOffsets(count: number, days: number): number[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = Math.round(((index + 0.5) * days) / count);
    return Math.min(days, Math.max(1, offset));
  });
}

/* ------------------------------------------------------------------ *
 * Resolução dos dados existentes
 * ------------------------------------------------------------------ */

async function resolveSubjects(
  manager: EntityManager,
  teacher: TeacherEntity,
): Promise<SubjectEntity[]> {
  if (teacher.subjects.length > 0) {
    return teacher.subjects;
  }

  /* Professor criado pelo user:create nasce sem disciplina nenhuma */
  const subjects = await manager
    .getRepository(SubjectEntity)
    .find({ order: { name: 'ASC' } });

  if (subjects.length === 0) {
    throw new Error(
      'Não há disciplinas cadastradas. Rode `npm run seed` antes de criar aulas.',
    );
  }

  console.log(
    `Aviso: o professor não tem disciplinas vinculadas — sorteando entre as ${subjects.length} cadastradas.`,
  );

  return subjects;
}

async function resolveContracts(
  manager: EntityManager,
  windowStart: string,
  windowEnd: string,
): Promise<StudentContractEntity[]> {
  const contracts = await manager.getRepository(StudentContractEntity).find({
    where: { status: ContractStatus.ACTIVE, student: { active: true } },
    relations: { student: { user: true, region: true }, plan: true },
    order: { startDate: 'ASC' },
  });

  if (contracts.length === 0) {
    throw new Error(
      'Não há contratos ativos de alunos ativos. Rode `npm run seed` antes de criar aulas.',
    );
  }

  /* Colunas date vêm como 'YYYY-MM-DD', então comparar string basta */
  const covering = contracts.filter(
    (contract) =>
      contract.startDate <= windowStart &&
      (!contract.endDate || contract.endDate >= windowEnd),
  );

  if (covering.length === 0) {
    console.log(
      'Aviso: nenhum contrato ativo cobre a janela inteira — usando os contratos ativos mesmo assim.',
    );
    return contracts;
  }

  return covering;
}

interface Pricing {
  cantinhoRegion: RegionEntity;
  planByKey: Map<string, PlanEntity>;
}

/*
 * Carrega a região Cantinho e todos os planos (com a região de cada um), para
 * resolver em memória a região e o plano equivalente de cada aula — mesma
 * regra de ClassesService.finalize() e do seed.
 */
async function resolvePricing(manager: EntityManager): Promise<Pricing> {
  const plans = await manager
    .getRepository(PlanEntity)
    .find({ relations: { region: true } });

  const planByKey = new Map(
    plans.map((plan) => [
      `${plan.region.slug}|${plan.planType}|${plan.frequency ?? 'null'}`,
      plan,
    ]),
  );

  const cantinhoRegion = plans.find(
    (plan) => plan.region.slug === CANTINHO_REGION_SLUG,
  )?.region;

  if (!cantinhoRegion) {
    throw new Error(
      `Região "${CANTINHO_REGION_SLUG}" não cadastrada. Rode \`npm run seed\` antes de criar aulas.`,
    );
  }

  return { cantinhoRegion, planByKey };
}

/* ------------------------------------------------------------------ *
 * Geração
 * ------------------------------------------------------------------ */

interface Plan {
  offsetDays: number;
  isPast: boolean;
}

function buildClass(
  manager: EntityManager,
  { offsetDays, isPast }: Plan,
  teacher: TeacherEntity,
  subject: SubjectEntity,
  contract: StudentContractEntity,
  today: Date,
  pricing: Pricing,
): ClassEntity {
  const classRepository = manager.getRepository(ClassEntity);
  const student = contract.student;

  const day = addDays(today, isPast ? -offsetDays : offsetDays);
  const scheduledAt = at(day, randomInt(8, 19), chance(0.5) ? 0 : 30);
  const durationMinutes = chance(0.75) ? 60 : chance(0.6) ? 90 : 120;
  const hours = durationMinutes / 60;

  let status: ClassStatus;
  if (!isPast) {
    status = ClassStatus.SCHEDULED;
  } else if (chance(0.85)) {
    status = ClassStatus.COMPLETED;
  } else if (chance(0.6)) {
    status = ClassStatus.CANCELLED;
  } else {
    status = ClassStatus.NO_SHOW;
  }

  const completed = status === ClassStatus.COMPLETED;
  const billable = (BILLABLE_STATUSES as readonly ClassStatus[]).includes(
    status,
  );
  const discount = Number(contract.discountPercentage ?? 0) / 100;

  const locationType =
    student.address && chance(0.7) ? LocationType.HOME : LocationType.SCHOOL;

  /*
   * Região da aula: no Cantinho (school) é sempre a região Cantinho, não a do
   * bairro do aluno; na casa do aluno (home) é a região dele. O valor cobrado
   * vem do plano equivalente (mesmo tipo/frequência) nessa região — mesma
   * regra de ClassesService.finalize().
   */
  const classRegionSlug =
    locationType === LocationType.HOME
      ? student.region.slug
      : CANTINHO_REGION_SLUG;
  const classRegion =
    locationType === LocationType.HOME
      ? student.region
      : pricing.cantinhoRegion;
  const classPlan = pricing.planByKey.get(
    `${classRegionSlug}|${contract.plan.planType}|${contract.plan.frequency ?? 'null'}`,
  );

  if (billable && !classPlan) {
    throw new Error(
      `Plano equivalente não encontrado na região da aula (${classRegionSlug}, ` +
        `${contract.plan.planType}, ${contract.plan.frequency ?? 'sem frequência'})`,
    );
  }

  return classRepository.create({
    studentContract: contract,
    teacher,
    subject,
    /* Região e valores só são congelados quando a aula é faturável */
    region: billable ? classRegion : null,
    scheduledAt: toTimestampString(scheduledAt),
    durationMinutes,
    locationType,
    status,
    commissionAmount: billable
      ? money(Number(classRegion.classCommission) * hours)
      : null,
    amountCharged: billable
      ? money(Number(classPlan!.hourPrice) * hours * (1 - discount))
      : null,
    notes: completed && chance(0.25) ? pick(CLASS_NOTES) : null,
  });
}

/*
 * Soma o amount_charged das aulas faturáveis (completed + no_show) de um
 * contrato cujo scheduled_at cai no mês (monthKey no formato YYYY-MM) — mesma
 * regra de StudentsService.findPaymentHistory().
 */
async function sumBillableAmount(
  manager: EntityManager,
  contractId: string,
  monthKey: string,
): Promise<string> {
  const [year, monthNumber] = monthKey.split('-').map(Number);
  const start = `${monthKey}-01 00:00:00`;
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const end = `${monthKey}-${String(lastDay).padStart(2, '0')} 23:59:59`;

  const result = await manager
    .getRepository(ClassEntity)
    .createQueryBuilder('class')
    .where('class.student_contract_id = :contractId', { contractId })
    .andWhere('class.status IN (:...billable)', { billable: BILLABLE_STATUSES })
    .andWhere('class.scheduled_at BETWEEN :start AND :end', { start, end })
    .select('COALESCE(SUM(class.amount_charged), 0)', 'amount')
    .getRawOne<{ amount: string }>();

  return money(Number(result?.amount ?? 0));
}

/*
 * O aluno não tem mensalidade fixa: payments.amount é apurado pelas aulas do
 * mês, e as novas aulas geradas aqui podem cair em competências que já têm
 * parcela lançada. Ressincroniza o amount dessas parcelas para não deixar o
 * calendário de cobrança desalinhado com o que as aulas realmente somam.
 */
async function resyncPayments(
  manager: EntityManager,
  classes: ClassEntity[],
): Promise<PaymentEntity[]> {
  const billableKeys = new Set(
    classes
      .filter((item) =>
        (BILLABLE_STATUSES as readonly ClassStatus[]).includes(item.status),
      )
      .map(
        (item) => `${item.studentContract.id}|${item.scheduledAt.slice(0, 7)}`,
      ),
  );

  if (billableKeys.size === 0) {
    return [];
  }

  const contractIds = [
    ...new Set(classes.map((item) => item.studentContract.id)),
  ];
  const paymentRepository = manager.getRepository(PaymentEntity);
  const payments = await paymentRepository.find({
    where: { studentContract: { id: In(contractIds) } },
    relations: { studentContract: true },
  });

  const updated: PaymentEntity[] = [];

  for (const payment of payments) {
    const monthKey = payment.dueDate.slice(0, 7);
    const key = `${payment.studentContract.id}|${monthKey}`;

    if (!billableKeys.has(key)) {
      continue;
    }

    payment.amount = await sumBillableAmount(
      manager,
      payment.studentContract.id,
      monthKey,
    );
    updated.push(payment);
  }

  if (updated.length > 0) {
    await paymentRepository.save(updated);
  }

  return updated;
}

/*
 * Tudo dentro de uma transação: se uma aula falhar, nenhuma fica no banco.
 */
async function createClasses(ds: DataSource, options: Options): Promise<void> {
  await ds.transaction(async (manager) => {
    const today = at(new Date(), 0);
    const windowStart = toDateString(addDays(today, -options.days));
    const windowEnd = toDateString(addDays(today, options.days));

    const teacher = await resolveTeacher(manager, options);
    const subjects = await resolveSubjects(manager, teacher);
    const contracts = await resolveContracts(manager, windowStart, windowEnd);
    const pricing = await resolvePricing(manager);

    /*
     * Nada é agendado para hoje: as aulas passadas ficam em [-days, -1] e as
     * futuras em [1, days]. Os endpoints do professor comparam scheduled_at
     * (hora local) com now.toISOString() (UTC), o que desloca o corte em
     * algumas horas — deixar o dia de hoje livre evita que uma aula futura
     * apareça no histórico, ou o contrário.
     */
    const plan: Plan[] = [
      ...spreadDayOffsets(options.past, options.days).map((offsetDays) => ({
        offsetDays,
        isPast: true,
      })),
      ...spreadDayOffsets(options.future, options.days).map((offsetDays) => ({
        offsetDays,
        isPast: false,
      })),
    ];

    /* Round-robin nos contratos e nas disciplinas: variedade sem repetir aluno */
    const classes = plan.map((item, index) =>
      buildClass(
        manager,
        item,
        teacher,
        subjects[index % subjects.length],
        contracts[index % contracts.length],
        today,
        pricing,
      ),
    );

    await manager.getRepository(ClassEntity).save(classes, { chunk: 100 });

    const resyncedPayments = await resyncPayments(manager, classes);

    report(teacher, classes, options, resyncedPayments);
  });
}

function report(
  teacher: TeacherEntity,
  classes: ClassEntity[],
  options: Options,
  resyncedPayments: PaymentEntity[],
): void {
  const countBy = (status: ClassStatus) =>
    classes.filter((item) => item.status === status).length;

  const students = new Set(
    classes.map((item) => item.studentContract.student.user.name),
  );

  const earnings = classes.reduce(
    (total, item) => total + Number(item.commissionAmount ?? 0),
    0,
  );

  console.log('');
  console.log(`Professor: ${teacher.user.name} <${teacher.user.email}>`);
  console.log(`  teacher_id: ${teacher.id}`);
  console.log(`  user_id:    ${teacher.user.id}`);

  console.log('');
  console.log(`Aulas criadas (janela de ${options.days} dias para cada lado):`);

  for (const item of [...classes].sort((a, b) =>
    a.scheduledAt.localeCompare(b.scheduledAt),
  )) {
    const student = item.studentContract.student.user.name;
    console.log(
      `  ${item.scheduledAt}  ${String(item.durationMinutes).padStart(3)}min  ` +
        `${item.status.padEnd(9)}  ${item.subject.name.padEnd(11)}  ${student}`,
    );
  }

  console.log('');
  console.log(`  total............... ${classes.length}`);
  console.log(`  agendadas........... ${countBy(ClassStatus.SCHEDULED)}`);
  console.log(`  concluídas.......... ${countBy(ClassStatus.COMPLETED)}`);
  console.log(`  canceladas.......... ${countBy(ClassStatus.CANCELLED)}`);
  console.log(`  no-show............. ${countBy(ClassStatus.NO_SHOW)}`);
  console.log(`  alunos envolvidos... ${students.size}`);
  console.log(`  comissão gerada..... R$ ${money(earnings)}`);

  if (resyncedPayments.length > 0) {
    console.log('');
    console.log(
      `Mensalidades ressincronizadas com as novas aulas: ${resyncedPayments.length}`,
    );
    for (const payment of resyncedPayments) {
      console.log(`  ${payment.dueDate}  R$ ${payment.amount}`);
    }
  }

  console.log('');
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    return;
  }

  const options = parseOptions(process.argv.slice(2));
  await withDataSource(dataSource, (ds) => createClasses(ds, options));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
