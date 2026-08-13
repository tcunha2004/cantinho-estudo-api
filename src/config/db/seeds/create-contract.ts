import 'dotenv/config';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import dataSource from '../data-source';
import { StudentEntity } from '../../../students/entity/student.entity';
import { PlanEntity } from '../../../plans/entity/plan.entity';
import { StudentContractEntity } from '../../../student-contracts/entity/student-contract.entity';
import { PaymentEntity } from '../../../payments/entity/payment.entity';
import { ContractStatus } from '../../../student-contracts/enums/contract-status.enum';
import { PaymentStatus } from '../../../payments/enums/payment-status.enum';
import { PlanType } from '../../../plans/enums/plan-type.enum';
import { Frequency } from '../../../plans/enums/frequency.enum';
import {
  addMonths,
  at,
  fromDateString,
  money,
  parseArgs,
  parseBoolean,
  parseDate,
  resolveStudent,
  toDateString,
  toTimestampString,
  UUID_PATTERN,
  withDataSource,
} from './helpers';

/*
 * Cria um contrato para um aluno já existente, sem apagar nada — ao contrário do
 * seed, que dá TRUNCATE em tudo. Serve para dar plano a um aluno criado pelo
 * user:create, ou para simular uma troca de plano durante o desenvolvimento.
 *
 *   npm run contract:create -- --email lucas.souza@example.com
 *   npm run contract:create -- --student 0f3c...c81 --plan-type prata
 *
 * O plano é procurado na região do aluno (a tabela `plans` tem um conjunto por
 * região), então basta informar o tipo e a frequência — ou o id do plano, com
 * --plan, se você quiser um plano de outra região.
 *
 * Junto com o contrato saem as mensalidades de cada competência entre o início
 * e o mês corrente (as passadas pagas, a do mês em aberto): sem elas as telas
 * financeiras do aluno ficam vazias. Use --payments no para pular.
 *
 * Flags:
 *   --student <uuid>   id do aluno (aceita o id em `students` ou o user_id)
 *   --email <email>    alternativa ao --student: acha o aluno pelo e-mail
 *   --plan <uuid>      id do plano (dispensa --plan-type / --frequency)
 *   --plan-type <tipo> ${Object.values(PlanType).join(' | ')} (padrão: ouro)
 *   --frequency <n>    aulas por semana, só para o ouro: 2 | 3 | 5 (padrão: 3)
 *   --start <data>     início do contrato, YYYY-MM-DD (padrão: 3 meses atrás)
 *   --end <data>       fim do contrato (padrão: validade do plano, se houver)
 *   --status <status>  ${Object.values(ContractStatus).join(' | ')} (padrão: active)
 *   --discount <n>     percentual de desconto, 0 a 100 (padrão: sem desconto)
 *   --payments <s/n>   gerar as mensalidades: yes | no (padrão: yes)
 *   --expire-current <s/n>  encerrar os contratos ativos que o aluno já tem
 *                           antes de criar o novo: yes | no (padrão: no)
 */

const DEFAULT_PLAN_TYPE = PlanType.OURO;
const DEFAULT_FREQUENCY = Frequency.THREE_TIMES_WEEK;
const DEFAULT_START_MONTHS_AGO = 3;

/* Dia do vencimento das mensalidades — o mesmo que o seed usa */
const DUE_DAY = 10;

const USAGE = `
Uso:
  npm run contract:create -- --student <uuid>
  npm run contract:create -- --email <email do aluno>

Opcionais:
  --plan <uuid>           id do plano (dispensa --plan-type / --frequency)
  --plan-type <tipo>      ${Object.values(PlanType).join(' | ')} (padrão: ${DEFAULT_PLAN_TYPE})
  --frequency <n>         só para o ouro: 2 | 3 | 5 (padrão: ${DEFAULT_FREQUENCY})
  --start <YYYY-MM-DD>    início (padrão: ${DEFAULT_START_MONTHS_AGO} meses atrás, dia 1)
  --end <YYYY-MM-DD>      fim (padrão: validade do plano, se houver)
  --status <status>       ${Object.values(ContractStatus).join(' | ')} (padrão: ${ContractStatus.ACTIVE})
  --discount <n>          percentual de desconto, 0 a 100
  --payments <yes|no>     gerar as mensalidades (padrão: yes)
  --expire-current <yes|no>  encerrar os contratos ativos do aluno (padrão: no)

Exemplos:
  npm run contract:create -- --email caio@escola.com
  npm run contract:create -- --email caio@escola.com --plan-type prata --discount 10
  npm run contract:create -- --email caio@escola.com --start 2026-01-01 --status cancelled
  npm run contract:create -- --email caio@escola.com --plan-type ouro --frequency 5 --expire-current yes
`.trim();

interface Options {
  student?: string;
  email?: string;
  plan?: string;
  planType: PlanType;
  frequency: Frequency | null;
  start: string;
  end?: string;
  status: ContractStatus;
  discount: number | null;
  payments: boolean;
  expireCurrent: boolean;
}

/* ------------------------------------------------------------------ *
 * Argumentos
 * ------------------------------------------------------------------ */

function parsePlanType(raw: string | undefined): PlanType {
  if (raw === undefined) {
    return DEFAULT_PLAN_TYPE;
  }

  const types = Object.values(PlanType);
  const planType = raw.toLowerCase() as PlanType;

  if (!types.includes(planType)) {
    throw new Error(
      `Tipo de plano inválido: "${raw}". Use um destes: ${types.join(', ')}`,
    );
  }

  return planType;
}

/*
 * A frequência só existe no ouro (os outros planos têm frequency nula em
 * `plans`), então informá-la nos demais é erro, não algo a ignorar em silêncio.
 */
function parseFrequency(
  raw: string | undefined,
  planType: PlanType,
): Frequency | null {
  if (planType !== PlanType.OURO) {
    if (raw !== undefined) {
      throw new Error(
        `--frequency vale só para o plano ouro (o ${planType} não tem frequência)`,
      );
    }

    return null;
  }

  if (raw === undefined) {
    return DEFAULT_FREQUENCY;
  }

  const options = Object.values(Frequency).filter(
    (value): value is Frequency => typeof value === 'number',
  );
  const frequency = Number(raw);

  if (!options.includes(frequency)) {
    throw new Error(
      `Frequência inválida: "${raw}". Use uma destas: ${options.join(', ')}`,
    );
  }

  return frequency;
}

function parseStatus(raw: string | undefined): ContractStatus {
  if (raw === undefined) {
    return ContractStatus.ACTIVE;
  }

  const statuses = Object.values(ContractStatus);
  const status = raw.toLowerCase() as ContractStatus;

  if (!statuses.includes(status)) {
    throw new Error(
      `Status inválido: "${raw}". Use um destes: ${statuses.join(', ')}`,
    );
  }

  return status;
}

function parseDiscount(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('--discount precisa ser um número entre 0 e 100');
  }

  return value;
}

function parseOptions(argv: string[]): Options {
  const args = parseArgs(argv);

  if (!args.student && !args.email) {
    throw new Error(`Informe --student ou --email\n\n${USAGE}`);
  }

  if (args.plan && (args['plan-type'] || args.frequency)) {
    throw new Error(
      '--plan já identifica o plano: não use --plan-type nem --frequency',
    );
  }

  if (args.plan && !UUID_PATTERN.test(args.plan)) {
    throw new Error(`--plan precisa ser um uuid (recebi "${args.plan}")`);
  }

  const planType = parsePlanType(args['plan-type']);

  /* Dia 1 do mês, para as mensalidades caírem em competências limpas */
  const defaultStart = at(new Date(), 0);
  defaultStart.setDate(1);

  const options: Options = {
    student: args.student,
    email: args.email?.toLowerCase(),
    plan: args.plan,
    planType,
    frequency: parseFrequency(args.frequency, planType),
    start: args.start
      ? parseDate(args.start, 'start')
      : toDateString(addMonths(defaultStart, -DEFAULT_START_MONTHS_AGO)),
    end: args.end ? parseDate(args.end, 'end') : undefined,
    status: parseStatus(args.status),
    discount: parseDiscount(args.discount),
    payments: parseBoolean(args.payments, true, 'payments'),
    expireCurrent: parseBoolean(
      args['expire-current'],
      false,
      'expire-current',
    ),
  };

  if (options.end && options.end < options.start) {
    throw new Error('--end não pode ser antes de --start');
  }

  return options;
}

/* ------------------------------------------------------------------ *
 * Resolução dos dados existentes
 * ------------------------------------------------------------------ */

/*
 * O plano vem da região do aluno, porque `plans` tem um conjunto por região e
 * os preços mudam entre elas. Com --plan o id manda, mesmo que seja de outra
 * região — útil para reproduzir dados antigos.
 */
async function resolvePlan(
  manager: EntityManager,
  options: Options,
  student: StudentEntity,
): Promise<PlanEntity> {
  const planRepository = manager.getRepository(PlanEntity);

  if (options.plan) {
    const plan = await planRepository.findOne({
      where: { id: options.plan },
      relations: { region: true },
    });

    if (!plan) {
      throw new Error(`Nenhum plano com id ${options.plan}`);
    }

    if (plan.region.id !== student.region.id) {
      console.log(
        `Aviso: o plano informado é da região ${plan.region.name}, e o aluno é da ${student.region.name}.`,
      );
    }

    return plan;
  }

  const plan = await planRepository.findOne({
    where: {
      region: { id: student.region.id },
      planType: options.planType,
      /* Coluna nula: comparar com null no where viraria `= NULL` */
      frequency: options.frequency ?? IsNull(),
    },
    relations: { region: true },
  });

  if (!plan) {
    const available = await planRepository.find({
      where: { region: { id: student.region.id } },
      order: { planType: 'ASC' },
    });

    throw new Error(
      `Nenhum plano ${options.planType}` +
        (options.frequency ? ` ${options.frequency}x/semana` : '') +
        ` na região ${student.region.name}. Disponíveis: ` +
        (available
          .map(
            (item) =>
              item.planType + (item.frequency ? ` (${item.frequency}x)` : ''),
          )
          .join(', ') || '(nenhum)'),
    );
  }

  return plan;
}

/*
 * Contratos ativos que o aluno já tem. As telas do aluno usam o contrato de
 * início mais recente, então dois ativos ao mesmo tempo não quebram nada — mas
 * confundem. Daí o aviso, e o --expire-current para encerrar os antigos.
 */
async function handleExistingContracts(
  manager: EntityManager,
  student: StudentEntity,
  options: Options,
): Promise<StudentContractEntity[]> {
  const contractRepository = manager.getRepository(StudentContractEntity);
  const active = await contractRepository.find({
    where: { student: { id: student.id }, status: ContractStatus.ACTIVE },
    relations: { plan: true },
    order: { startDate: 'ASC' },
  });

  if (active.length === 0) {
    return [];
  }

  if (!options.expireCurrent) {
    console.log(
      `Aviso: o aluno já tem ${active.length} contrato(s) ativo(s) ` +
        `(${active.map((item) => `${item.plan.planType} desde ${item.startDate}`).join('; ')}). ` +
        'Use --expire-current yes para encerrá-los.',
    );
    return [];
  }

  /* Encerra no dia anterior ao novo início, para as vigências não se sobreporem */
  const endDate = toDateString(
    new Date(fromDateString(options.start).getTime() - 24 * 60 * 60 * 1000),
  );

  const expired = active.map((contract) => {
    contract.status = ContractStatus.CANCELLED;
    /* Não estica um fim que já era anterior ao novo contrato */
    contract.endDate =
      contract.endDate && contract.endDate < endDate
        ? contract.endDate
        : endDate;
    return contract;
  });

  await contractRepository.save(expired);

  return expired;
}

/* ------------------------------------------------------------------ *
 * Geração
 * ------------------------------------------------------------------ */

function resolveEndDate(options: Options, plan: PlanEntity): string | null {
  if (options.end) {
    return options.end;
  }

  /* Bronze tem validade de 2 meses; os outros planos são contínuos */
  if (plan.validityMonths) {
    return toDateString(
      addMonths(fromDateString(options.start), plan.validityMonths),
    );
  }

  return null;
}

/*
 * Uma mensalidade por competência entre o início do contrato e o mês corrente
 * (ou o fim do contrato, se já passou). As passadas saem pagas, a do mês
 * corrente fica em aberto — e num contrato cancelado, cancelada.
 *
 * O aluno não tem mensalidade fixa: o valor de cada parcela é apurado pelas
 * aulas do mês (StudentsService.findPaymentHistory()), e este script cria o
 * contrato sem aulas. Por isso as parcelas nascem com amount 0 — um calendário
 * vazio que se preenche quando `npm run classes:create` gerar aulas para o
 * contrato.
 */
function buildPayments(
  manager: EntityManager,
  contract: StudentContractEntity,
  startDate: Date,
  endDate: Date | null,
  today: Date,
): PaymentEntity[] {
  const paymentRepository = manager.getRepository(PaymentEntity);
  const amount = money(0);

  const lastBilled = endDate && endDate < today ? endDate : today;
  const lastMonth = new Date(
    lastBilled.getFullYear(),
    lastBilled.getMonth(),
    1,
  );

  const payments: PaymentEntity[] = [];

  for (
    let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    cursor <= lastMonth;
    cursor = addMonths(cursor, 1)
  ) {
    const dueDate = at(
      new Date(cursor.getFullYear(), cursor.getMonth(), DUE_DAY),
      0,
    );
    const isCurrentMonth =
      dueDate.getFullYear() === today.getFullYear() &&
      dueDate.getMonth() === today.getMonth();

    let status: PaymentStatus;
    let paidAt: string | null = null;

    if (isCurrentMonth && contract.status === ContractStatus.CANCELLED) {
      status = PaymentStatus.CANCELLED;
    } else if (isCurrentMonth) {
      status = PaymentStatus.PENDING;
    } else {
      status = PaymentStatus.PAID;
      paidAt = toTimestampString(at(dueDate, 10));
    }

    payments.push(
      paymentRepository.create({
        studentContract: contract,
        amount,
        dueDate: toDateString(dueDate),
        paidAt,
        status,
      }),
    );
  }

  return payments;
}

/*
 * Tudo dentro de uma transação: se as mensalidades falharem, o contrato não
 * fica no banco sem elas.
 */
async function createContract(ds: DataSource, options: Options): Promise<void> {
  await ds.transaction(async (manager) => {
    const today = at(new Date(), 0);

    const student = await resolveStudent(manager, options);
    const plan = await resolvePlan(manager, options, student);
    const expired = await handleExistingContracts(manager, student, options);

    const endDate = resolveEndDate(options, plan);

    if (endDate && endDate < options.start) {
      throw new Error(
        `A validade do plano (${plan.validityMonths} meses) cai antes do início. Informe --end.`,
      );
    }

    const contract = await manager.getRepository(StudentContractEntity).save(
      manager.getRepository(StudentContractEntity).create({
        student,
        plan,
        startDate: options.start,
        endDate,
        discountPercentage:
          options.discount === null ? null : money(options.discount),
        status: options.status,
      }),
    );

    const payments = options.payments
      ? buildPayments(
          manager,
          contract,
          fromDateString(options.start),
          endDate ? fromDateString(endDate) : null,
          today,
        )
      : [];

    if (payments.length > 0) {
      await manager.getRepository(PaymentEntity).save(payments);
    }

    report(student, plan, contract, payments, expired);
  });
}

function report(
  student: StudentEntity,
  plan: PlanEntity,
  contract: StudentContractEntity,
  payments: PaymentEntity[],
  expired: StudentContractEntity[],
): void {
  console.log('');
  console.log(`Aluno: ${student.user.name} <${student.user.email}>`);
  console.log(`  student_id: ${student.id}`);
  console.log(`  user_id:    ${student.user.id}`);
  console.log(`  região:     ${student.region.name} (${student.region.slug})`);

  if (expired.length > 0) {
    console.log('');
    console.log(`Contratos encerrados: ${expired.length}`);
    for (const item of expired) {
      console.log(`  ${item.id}  ${item.plan.planType}  até ${item.endDate}`);
    }
  }

  console.log('');
  console.log('Contrato criado:');
  console.log(`  id:          ${contract.id}`);
  console.log(
    `  plano:       ${plan.planType}` +
      (plan.frequency ? ` ${plan.frequency}x/semana` : '') +
      ` — R$ ${plan.monthlyPrice}/mês (${plan.id})`,
  );
  console.log(
    `  vigência:    ${contract.startDate} → ${contract.endDate ?? 'sem fim'}`,
  );
  console.log(`  status:      ${contract.status}`);
  console.log(`  desconto:    ${contract.discountPercentage ?? 'nenhum'}`);

  if (payments.length === 0) {
    console.log('');
    console.log('Mensalidades: nenhuma (--payments no)');
    console.log('');
    return;
  }

  const countBy = (status: PaymentStatus) =>
    payments.filter((item) => item.status === status).length;

  console.log('');
  console.log(`Mensalidades criadas: ${payments.length}`);
  console.log(
    '  (calendário vazio — o valor de cada parcela é apurado pelas aulas do mês; ' +
      'rode `npm run classes:create` para gerar aulas e preencher os valores)',
  );
  for (const item of payments) {
    console.log(
      `  ${item.dueDate}  R$ ${String(item.amount).padStart(9)}  ${item.status}`,
    );
  }
  console.log('');
  console.log(`  pagas............... ${countBy(PaymentStatus.PAID)}`);
  console.log(`  em aberto........... ${countBy(PaymentStatus.PENDING)}`);
  console.log(`  canceladas.......... ${countBy(PaymentStatus.CANCELLED)}`);
  console.log('');
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    return;
  }

  const options = parseOptions(process.argv.slice(2));
  await withDataSource(dataSource, (ds) => createContract(ds, options));
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
