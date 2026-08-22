import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { ClassStatus } from '../src/classes/enums/class-status.enum';

/*
 * Bateria HTTP contra a API e o banco de verdade — pega o que o teste unitário
 * com repositório mockado não vê: query que não roda, relação não carregada,
 * validação de dto, ordem de rota, status code, papel que não deveria passar.
 *
 * Pré-requisito: banco de desenvolvimento no ar e `npm run seed` rodado
 * (contas admin@teste.com / prof@teste.com / aluno@teste.com, senha teste123).
 * Rode com `npm run test:e2e`, que já carrega .env.local e o fuso.
 *
 * O app sobe em processo (não no container): o que se testa é o código-fonte
 * atual, não a imagem buildada.
 */

const PASSWORD = 'teste123';
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

/* Mês corrente no formato que os endpoints esperam. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/* Horário ingênuo (sem fuso) de hoje numa hora cheia. */
function todayAt(hour: number): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  return `${day}T${String(hour).padStart(2, '0')}:00`;
}

describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  let adminToken: string;
  let profToken: string;
  let alunoToken: string;

  let teacherId: string;
  let studentId: string;
  let subjectId: string;

  /* Aulas criadas pelos testes, para limpar no fim. */
  const createdClassIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(email: string, role: string): Promise<string> {
    const response = await request(server)
      .post('/auth/login')
      .send({ email, password: PASSWORD, role })
      .expect(201);

    return (response.body as { access_token: string }).access_token;
  }

  async function createClass(body: Record<string, unknown>) {
    const response = await request(server)
      .post('/classes')
      .set(auth(adminToken))
      .send({
        studentId,
        teacherId,
        subjectId,
        locationType: 'school',
        ...body,
      });

    if (response.status === 201) {
      createdClassIds.push((response.body as { id: string }).id);
    }

    return response;
  }

  /*
   * Libera um horário: cancela (reabrindo antes, se preciso) o que estiver
   * marcado ali. Sem isso, uma rodada interrompida no meio deixa o horário
   * ocupado e a rodada seguinte falha por conflito.
   */
  async function liberarHorario(scheduledAt: string) {
    const day = scheduledAt.slice(0, 10);
    const agenda = (
      await request(server)
        .get('/classes/agenda')
        .query({ from: day, to: day })
        .set(auth(adminToken))
    ).body as { id: string; scheduledAt: string; status: string }[];

    for (const item of agenda) {
      if (item.scheduledAt !== `${scheduledAt}:00` || item.status === 'cancelled') {
        continue;
      }
      if (item.status !== ClassStatus.SCHEDULED) {
        await request(server)
          .patch(`/classes/${item.id}/reopen`)
          .set(auth(adminToken));
      }
      await request(server)
        .patch(`/classes/${item.id}/cancel`)
        .set(auth(adminToken));
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    /* Mesmo pipe do main.ts — sem ele a validação dos dtos não roda. */
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    server = app.getHttpServer();

    adminToken = await login('admin@teste.com', 'admin');
    profToken = await login('prof@teste.com', 'professor');
    alunoToken = await login('aluno@teste.com', 'student');

    const options = await request(server)
      .get('/classes/form-options')
      .set(auth(adminToken))
      .expect(200);

    const body = options.body as {
      teachers: { id: string; subjects: { id: string }[] }[];
      students: { id: string }[];
    };

    if (!body.teachers.length || !body.students.length) {
      throw new Error(
        'Banco sem dados de seed: rode `npm run seed` antes do test:e2e',
      );
    }

    teacherId = body.teachers[0].id;
    subjectId = body.teachers[0].subjects[0].id;
    studentId = body.students[0].id;
  });

  afterAll(async () => {
    /* Cancelar devolve o horário e não deixa dinheiro apurado para trás. */
    for (const id of createdClassIds) {
      await request(server)
        .patch(`/classes/${id}/reopen`)
        .set(auth(adminToken));
      await request(server)
        .patch(`/classes/${id}/cancel`)
        .set(auth(adminToken));
    }
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('devolve token para as três contas de teste', () => {
      expect(adminToken).toBeTruthy();
      expect(profToken).toBeTruthy();
      expect(alunoToken).toBeTruthy();
    });

    it('recusa senha errada com 401', async () => {
      await request(server)
        .post('/auth/login')
        .send({ email: 'admin@teste.com', password: 'errada', role: 'admin' })
        .expect(401);
    });

    it('recusa papel que não é o do usuário com 401', async () => {
      await request(server)
        .post('/auth/login')
        .send({ email: 'admin@teste.com', password: PASSWORD, role: 'student' })
        .expect(401);
    });

    it('recusa e-mail inexistente com 401', async () => {
      await request(server)
        .post('/auth/login')
        .send({ email: 'ninguem@teste.com', password: PASSWORD, role: 'admin' })
        .expect(401);
    });

    it('recusa payload inválido com 400', async () => {
      await request(server)
        .post('/auth/login')
        .send({ email: 'nao-e-email', password: '' })
        .expect(400);
    });

    it('não devolve a senha do usuário', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email: 'admin@teste.com', password: PASSWORD, role: 'admin' });

      expect(JSON.stringify(response.body)).not.toContain('password');
    });
  });

  describe('autenticação e autorização', () => {
    it('rota protegida sem token devolve 401', async () => {
      await request(server).get('/students/active').expect(401);
    });

    it('token malformado devolve 401', async () => {
      await request(server)
        .get('/students/active')
        .set({ Authorization: 'Bearer token-invalido' })
        .expect(401);
    });

    it('esquema diferente de Bearer devolve 401', async () => {
      await request(server)
        .get('/students/active')
        .set({ Authorization: `Basic ${adminToken}` })
        .expect(401);
    });

    const somenteAdmin = [
      '/students/active',
      '/students/active/count',
      '/classes/today/upcoming',
      '/classes/current-week/count',
      '/classes/current-month/revenue',
      '/regions/pricing',
      '/subjects',
    ];

    it.each(somenteAdmin)('%s é exclusiva do admin', async (path) => {
      await request(server).get(path).set(auth(adminToken)).expect(200);
      await request(server).get(path).set(auth(profToken)).expect(403);
      await request(server).get(path).set(auth(alunoToken)).expect(403);
    });

    it('rotas do aluno não abrem para admin nem professor', async () => {
      for (const path of ['/students/me/plan', '/students/me/payments']) {
        await request(server).get(path).set(auth(alunoToken)).expect(200);
        await request(server).get(path).set(auth(adminToken)).expect(404);
      }
    });

    it('professor não acessa o formulário de aula como aluno', async () => {
      await request(server)
        .get('/classes/form-options')
        .set(auth(profToken))
        .expect(200);
      await request(server)
        .get('/classes/form-options')
        .set(auth(alunoToken))
        .expect(403);
    });
  });

  describe('GET /students', () => {
    it('lista alunos ativos com plano, região e status do contrato', async () => {
      const response = await request(server)
        .get('/students/active')
        .set(auth(adminToken))
        .expect(200);

      const students = response.body as Record<string, unknown>[];
      expect(students.length).toBeGreaterThan(0);
      expect(Object.keys(students[0]).sort()).toEqual([
        'contractStatus',
        'frequency',
        'guardian',
        'id',
        'name',
        'plan',
        'region',
      ]);
    });

    it('contagem de ativos bate com o tamanho da lista', async () => {
      const [list, count] = await Promise.all([
        request(server).get('/students/active').set(auth(adminToken)),
        request(server).get('/students/active/count').set(auth(adminToken)),
      ]);

      expect((count.body as { count: number }).count).toBe(
        (list.body as unknown[]).length,
      );
    });

    it('detalhe traz região, responsáveis e contratos', async () => {
      const response = await request(server)
        .get(`/students/${studentId}`)
        .set(auth(adminToken))
        .expect(200);

      const student = response.body as Record<string, unknown>;
      expect(student.id).toBe(studentId);
      expect(student.region).toMatchObject({ name: expect.any(String) });
      expect(Array.isArray(student.guardians)).toBe(true);
      expect(Array.isArray(student.contracts)).toBe(true);
    });

    it('id inexistente devolve 404', async () => {
      await request(server)
        .get(`/students/${UUID_INEXISTENTE}`)
        .set(auth(adminToken))
        .expect(404);
    });

    it('id que não é uuid devolve 400', async () => {
      await request(server)
        .get('/students/nao-e-uuid')
        .set(auth(adminToken))
        .expect(400);
    });

    it('plano do aluno traz a mensalidade do plano contratado', async () => {
      const response = await request(server)
        .get('/students/me/plan')
        .set(auth(alunoToken))
        .expect(200);

      const plan = response.body as Record<string, string>;
      expect(Number(plan.monthlyPrice)).toBeGreaterThan(0);
      expect(Number(plan.hourPrice)).toBeGreaterThan(0);
      expect(plan.contractStatus).toBe('active');
    });

    it('outros planos não repetem o plano atual', async () => {
      const [plan, others] = await Promise.all([
        request(server).get('/students/me/plan').set(auth(alunoToken)),
        request(server).get('/students/me/other-plans').set(auth(alunoToken)),
      ]);

      const current = plan.body as { planType: string; frequency: number | null };
      const list = others.body as { planType: string; frequency: number | null }[];

      expect(
        list.some(
          (item) =>
            item.planType === current.planType &&
            item.frequency === current.frequency,
        ),
      ).toBe(false);
    });

    it('histórico de pagamentos apura o valor pelas aulas do mês', async () => {
      const response = await request(server)
        .get('/students/me/payments')
        .set(auth(alunoToken))
        .expect(200);

      const payments = response.body as Record<string, unknown>[];
      expect(Array.isArray(payments)).toBe(true);
      if (payments.length) {
        expect(payments[0]).toMatchObject({
          amount: expect.any(String),
          dueDate: expect.any(String),
          classesCount: expect.any(Number),
        });
      }
    });
  });

  describe('PATCH /students/:id', () => {
    it('edita telefone e endereço e devolve o detalhe atualizado', async () => {
      const original = (
        await request(server)
          .get(`/students/${studentId}`)
          .set(auth(adminToken))
      ).body as { phone: string; address: string | null };

      const response = await request(server)
        .patch(`/students/${studentId}`)
        .set(auth(adminToken))
        .send({ phone: '(31) 98888-1234', address: 'Rua dos Testes, 42' })
        .expect(200);

      expect(response.body).toMatchObject({
        phone: '(31) 98888-1234',
        address: 'Rua dos Testes, 42',
      });

      await request(server)
        .patch(`/students/${studentId}`)
        .set(auth(adminToken))
        .send({ phone: original.phone, address: original.address })
        .expect(200);
    });

    it('recusa desconto fora do formato', async () => {
      await request(server)
        .patch(`/students/${studentId}`)
        .set(auth(adminToken))
        .send({ discountPercentage: 'dez por cento' })
        .expect(400);
    });

    it('recusa campo desconhecido no corpo', async () => {
      await request(server)
        .patch(`/students/${studentId}`)
        .set(auth(adminToken))
        .send({ campoQueNaoExiste: 1 })
        .expect(400);
    });

    it('recusa planId que não é uuid', async () => {
      await request(server)
        .patch(`/students/${studentId}`)
        .set(auth(adminToken))
        .send({ planId: '' })
        .expect(400);
    });

    it('professor não edita aluno', async () => {
      await request(server)
        .patch(`/students/${studentId}`)
        .set(auth(profToken))
        .send({ phone: '(31) 90000-0000' })
        .expect(403);
    });

    it('aluno inexistente devolve 404', async () => {
      await request(server)
        .patch(`/students/${UUID_INEXISTENTE}`)
        .set(auth(adminToken))
        .send({ phone: '(31) 90000-0000' })
        .expect(404);
    });
  });

  describe('GET /teachers e PATCH /teachers/:id', () => {
    it('ganhos do mês somam por professor e no total', async () => {
      const response = await request(server)
        .get('/teachers/all/monthly-earnings')
        .query({ month: currentMonth() })
        .set(auth(adminToken))
        .expect(200);

      const summary = response.body as {
        totalCompletedClasses: number;
        totalAmountToReceive: number;
        teachers: { completedClasses: number; amountToReceive: number }[];
      };

      expect(summary.teachers.length).toBeGreaterThan(0);
      expect(summary.totalCompletedClasses).toBe(
        summary.teachers.reduce(
          (total, teacher) => total + teacher.completedClasses,
          0,
        ),
      );
      expect(summary.totalAmountToReceive).toBeCloseTo(
        summary.teachers.reduce(
          (total, teacher) => total + teacher.amountToReceive,
          0,
        ),
        2,
      );
    });

    it('mês em formato inválido devolve 400', async () => {
      await request(server)
        .get('/teachers/all/monthly-earnings')
        .query({ month: 'agosto' })
        .set(auth(adminToken))
        .expect(400);
    });

    it('detalhe traz matérias do professor', async () => {
      const response = await request(server)
        .get(`/teachers/${teacherId}`)
        .set(auth(adminToken))
        .expect(200);

      expect(response.body).toMatchObject({
        id: teacherId,
        active: true,
        subjects: expect.any(Array),
      });
    });

    it('professor inexistente devolve 404', async () => {
      await request(server)
        .get(`/teachers/${UUID_INEXISTENTE}`)
        .set(auth(adminToken))
        .expect(404);
    });

    it('edita bio e devolve o detalhe atualizado', async () => {
      const original = (
        await request(server)
          .get(`/teachers/${teacherId}`)
          .set(auth(adminToken))
      ).body as { bio: string | null };

      const response = await request(server)
        .patch(`/teachers/${teacherId}`)
        .set(auth(adminToken))
        .send({ bio: 'Bio de teste automatizado' })
        .expect(200);

      expect(response.body).toMatchObject({ bio: 'Bio de teste automatizado' });

      await request(server)
        .patch(`/teachers/${teacherId}`)
        .set(auth(adminToken))
        .send({ bio: original.bio })
        .expect(200);
    });

    it('substitui as matérias e recoloca as originais', async () => {
      const subjects = (
        await request(server).get('/subjects').set(auth(adminToken))
      ).body as { id: string; name: string }[];
      const original = (
        await request(server)
          .get(`/teachers/${teacherId}`)
          .set(auth(adminToken))
      ).body as { subjects: { id: string }[] };

      const outra = subjects.find(
        (subject) => !original.subjects.some((item) => item.id === subject.id),
      );

      const response = await request(server)
        .patch(`/teachers/${teacherId}`)
        .set(auth(adminToken))
        .send({ subjectIds: [outra!.id] })
        .expect(200);

      expect((response.body as { subjects: { id: string }[] }).subjects).toEqual(
        [{ id: outra!.id, name: outra!.name }],
      );

      await request(server)
        .patch(`/teachers/${teacherId}`)
        .set(auth(adminToken))
        .send({ subjectIds: original.subjects.map((subject) => subject.id) })
        .expect(200);
    });

    it('bio e matérias no mesmo PATCH: as duas coisas persistem', async () => {
      const original = (
        await request(server)
          .get(`/teachers/${teacherId}`)
          .set(auth(adminToken))
      ).body as { bio: string | null; subjects: { id: string }[] };

      const subjects = (
        await request(server).get('/subjects').set(auth(adminToken))
      ).body as { id: string }[];

      await request(server)
        .patch(`/teachers/${teacherId}`)
        .set(auth(adminToken))
        .send({
          bio: 'bio e matérias juntas',
          subjectIds: [subjects[0].id, subjects[1].id],
        })
        .expect(200);

      /* Relê do banco: a resposta poderia estar mentindo. */
      const depois = (
        await request(server)
          .get(`/teachers/${teacherId}`)
          .set(auth(adminToken))
      ).body as { bio: string | null; subjects: { id: string }[] };

      expect(depois.bio).toBe('bio e matérias juntas');
      expect(depois.subjects).toHaveLength(2);

      await request(server)
        .patch(`/teachers/${teacherId}`)
        .set(auth(adminToken))
        .send({
          bio: original.bio,
          subjectIds: original.subjects.map((subject) => subject.id),
        })
        .expect(200);
    });

    it('id que não é uuid devolve 400, não erro de banco', async () => {
      await request(server)
        .get('/teachers/nao-e-uuid')
        .set(auth(adminToken))
        .expect(400);
      await request(server)
        .patch('/teachers/nao-e-uuid')
        .set(auth(adminToken))
        .send({ bio: 'x' })
        .expect(400);
    });

    it('professor não edita professor', async () => {
      await request(server)
        .patch(`/teachers/${teacherId}`)
        .set(auth(profToken))
        .send({ bio: 'tentativa' })
        .expect(403);
    });
  });

  describe('GET /regions/pricing e /subjects', () => {
    it('tabela de preços traz comissão por região e planos ordenados', async () => {
      const response = await request(server)
        .get('/regions/pricing')
        .set(auth(adminToken))
        .expect(200);

      const regions = response.body as {
        name: string;
        classCommission: string;
        plans: { planType: string }[];
      }[];

      expect(regions.length).toBeGreaterThan(0);
      for (const region of regions) {
        expect(Number(region.classCommission)).toBeGreaterThan(0);
        expect(region.plans.length).toBeGreaterThan(0);
        expect(region.plans[0].planType).toBe('ouro');
      }
    });

    it('matérias vêm em ordem alfabética', async () => {
      const response = await request(server)
        .get('/subjects')
        .set(auth(adminToken))
        .expect(200);

      const names = (response.body as { name: string }[]).map(
        (subject) => subject.name,
      );
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });
  });

  describe('GET /student-contracts/active/count-by-plan-type', () => {
    it('devolve todos os tipos de plano, inclusive zerados', async () => {
      const response = await request(server)
        .get('/student-contracts/active/count-by-plan-type')
        .set(auth(adminToken))
        .expect(200);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'avulsa',
        'bronze',
        'ouro',
        'prata',
      ]);
    });
  });

  describe('GET /classes — painel e agenda', () => {
    it('painel do admin devolve números, não texto', async () => {
      const [week, revenue] = await Promise.all([
        request(server)
          .get('/classes/current-week/count')
          .set(auth(adminToken))
          .expect(200),
        request(server)
          .get('/classes/current-month/revenue')
          .set(auth(adminToken))
          .expect(200),
      ]);

      expect(typeof (week.body as { count: number }).count).toBe('number');
      expect(
        typeof (revenue.body as { revenue: number }).revenue,
      ).toBe('number');
    });

    it('próximas aulas de hoje vêm ordenadas por horário', async () => {
      const response = await request(server)
        .get('/classes/today/upcoming')
        .set(auth(adminToken))
        .expect(200);

      const classes = response.body as { scheduledAt: string }[];
      const times = classes.map((item) => item.scheduledAt);
      expect(times).toEqual([...times].sort());
    });

    it('agenda exige from e to', async () => {
      await request(server)
        .get('/classes/agenda')
        .set(auth(adminToken))
        .expect(400);
    });

    it('agenda recusa intervalo maior que 62 dias', async () => {
      await request(server)
        .get('/classes/agenda')
        .query({ from: '2026-01-01', to: '2026-06-01' })
        .set(auth(adminToken))
        .expect(400);
    });

    it('agenda recusa data fora do formato', async () => {
      await request(server)
        .get('/classes/agenda')
        .query({ from: '01/01/2026', to: '02/01/2026' })
        .set(auth(adminToken))
        .expect(400);
    });

    it('aulas do professor no mês batem com a agenda do mesmo período', async () => {
      const month = currentMonth();
      const [count, earnings] = await Promise.all([
        request(server)
          .get('/classes/teacher/monthly-count')
          .query({ month })
          .set(auth(profToken))
          .expect(200),
        request(server)
          .get('/classes/teacher/monthly-earnings')
          .query({ month })
          .set(auth(profToken))
          .expect(200),
      ]);

      expect(typeof (count.body as { count: number }).count).toBe('number');
      expect(
        typeof (earnings.body as { amountToReceive: number }).amountToReceive,
      ).toBe('number');
    });

    it('aulas por semana devolvem uma entrada por semana do mês', async () => {
      const response = await request(server)
        .get('/classes/teacher/weekly-count')
        .query({ month: currentMonth() })
        .set(auth(profToken))
        .expect(200);

      const weeks = response.body as { week: number; count: number | null }[];
      expect(weeks.length).toBeGreaterThanOrEqual(4);
      expect(weeks.map((item) => item.week)).toEqual(
        weeks.map((_, index) => index + 1),
      );
    });
  });

  describe('ciclo de vida da aula', () => {
    it('cria, aparece na agenda, conclui e entra em comissão — sem mexer na receita', async () => {
      const month = currentMonth();
      const scheduledAt = todayAt(7);

      const revenueBefore = (
        await request(server)
          .get('/classes/monthly-revenue')
          .query({ month })
          .set(auth(adminToken))
      ).body as { revenue: number };
      const earningsBefore = (
        await request(server)
          .get('/classes/teacher/monthly-earnings')
          .query({ month })
          .set(auth(profToken))
      ).body as { amountToReceive: number };

      const created = await createClass({ scheduledAt, durationMinutes: 60 });
      expect(created.status).toBe(201);

      const aula = created.body as {
        id: string;
        scheduledAt: string;
        endsAt: string;
        status: string;
        amountCharged: string | null;
      };
      /* Horário volta exatamente como foi enviado — sem deslocamento de fuso. */
      expect(aula.scheduledAt).toBe(`${scheduledAt}:00`);
      expect(aula.endsAt).toBe(`${scheduledAt.slice(0, 11)}08:00:00`);
      expect(aula.status).toBe(ClassStatus.SCHEDULED);
      expect(aula.amountCharged).toBeNull();

      const day = scheduledAt.slice(0, 10);
      const agenda = (
        await request(server)
          .get('/classes/agenda')
          .query({ from: day, to: day })
          .set(auth(adminToken))
      ).body as { id: string }[];
      expect(agenda.some((item) => item.id === aula.id)).toBe(true);

      /* O aluno e o professor da aula também a veem na própria agenda. */
      for (const token of [profToken, alunoToken]) {
        const own = (
          await request(server)
            .get('/classes/agenda')
            .query({ from: day, to: day })
            .set(auth(token))
        ).body as { id: string }[];
        expect(own.some((item) => item.id === aula.id)).toBe(true);
      }

      const completed = (
        await request(server)
          .patch(`/classes/${aula.id}/complete`)
          .set(auth(adminToken))
          .expect(200)
      ).body as {
        status: string;
        commissionAmount: string;
        amountCharged: string;
        region: string;
      };

      expect(completed.status).toBe(ClassStatus.COMPLETED);
      expect(Number(completed.commissionAmount)).toBeGreaterThan(0);
      /* Aluno de plano mensal não é cobrado por aula. */
      expect(completed.amountCharged).toBeNull();

      /* Aula no Cantinho: comissão é a da região Cantinho × horas. */
      const regions = (
        await request(server).get('/regions/pricing').set(auth(adminToken))
      ).body as { slug: string; name: string; classCommission: string }[];
      const cantinho = regions.find((region) => region.slug === 'cantinho')!;
      expect(completed.region).toBe(cantinho.name);
      expect(Number(completed.commissionAmount)).toBeCloseTo(
        Number(cantinho.classCommission),
        2,
      );

      const revenueAfter = (
        await request(server)
          .get('/classes/monthly-revenue')
          .query({ month })
          .set(auth(adminToken))
      ).body as { revenue: number };
      const earningsAfter = (
        await request(server)
          .get('/classes/teacher/monthly-earnings')
          .query({ month })
          .set(auth(profToken))
      ).body as { amountToReceive: number };

      /*
       * A receita é a mensalidade, não a aula: concluir uma aula de plano
       * mensal não muda o faturamento do mês. A comissão, essa sim, entra.
       */
      expect(revenueAfter.revenue).toBeCloseTo(revenueBefore.revenue, 2);
      expect(
        earningsAfter.amountToReceive - earningsBefore.amountToReceive,
      ).toBeCloseTo(Number(completed.commissionAmount), 2);

      /* Reabrir descongela; cancelar libera o horário. */
      await request(server)
        .patch(`/classes/${aula.id}/reopen`)
        .set(auth(adminToken))
        .expect(200);
      await request(server)
        .patch(`/classes/${aula.id}/cancel`)
        .set(auth(adminToken))
        .expect(200);

      const revenueFinal = (
        await request(server)
          .get('/classes/monthly-revenue')
          .query({ month })
          .set(auth(adminToken))
      ).body as { revenue: number };
      expect(revenueFinal.revenue).toBeCloseTo(revenueBefore.revenue, 2);
    });

    it('a mensalidade do aluno não se move com a aula concluída', async () => {
      const scheduledAt = todayAt(8);
      await liberarHorario(scheduledAt);
      const created = await createClass({ scheduledAt });
      expect(created.status).toBe(201);
      const aulaId = (created.body as { id: string }).id;

      const before = (
        await request(server).get('/students/me/payments').set(auth(alunoToken))
      ).body as { dueDate: string; amount: string; classesCount: number }[];

      await request(server)
        .patch(`/classes/${aulaId}/complete`)
        .set(auth(adminToken))
        .expect(200);

      const after = (
        await request(server).get('/students/me/payments').set(auth(alunoToken))
      ).body as { dueDate: string; amount: string; classesCount: number }[];

      const month = currentMonth();
      const parcelaAntes = before.find((item) => item.dueDate.startsWith(month));
      const parcelaDepois = after.find((item) => item.dueDate.startsWith(month));

      /*
       * O aluno paga o plano, não as aulas: o valor da parcela é o mesmo antes
       * e depois. A contagem de aulas do mês é só informativa e essa, sim, sobe.
       */
      expect(parcelaDepois).toBeDefined();
      expect(parcelaDepois!.amount).toBe(parcelaAntes!.amount);
      expect(parcelaDepois!.classesCount).toBeGreaterThanOrEqual(
        parcelaAntes!.classesCount,
      );
      expect(parcelaDepois!.amount).toMatch(/^\d+\.\d{2}$/);
    });

    it('recusa aula sobreposta para o mesmo professor', async () => {
      const scheduledAt = todayAt(9);
      expect((await createClass({ scheduledAt })).status).toBe(201);

      const conflito = await createClass({ scheduledAt });
      expect(conflito.status).toBe(409);
      expect((conflito.body as { message: string }).message).toContain(
        'já tem uma aula nesse horário',
      );
    });

    it('recusa aula que começa dentro de outra ainda em andamento', async () => {
      expect(
        (await createClass({ scheduledAt: todayAt(10), durationMinutes: 120 }))
          .status,
      ).toBe(201);

      const conflito = await createClass({ scheduledAt: todayAt(11) });
      expect(conflito.status).toBe(409);
    });

    it('aceita aula que começa quando a anterior termina', async () => {
      expect(
        (await createClass({ scheduledAt: todayAt(13), durationMinutes: 60 }))
          .status,
      ).toBe(201);
      expect((await createClass({ scheduledAt: todayAt(14) })).status).toBe(201);
    });

    it('recusa matéria que o professor não leciona', async () => {
      const subjects = (
        await request(server).get('/subjects').set(auth(adminToken))
      ).body as { id: string }[];
      const teacher = (
        await request(server)
          .get(`/teachers/${teacherId}`)
          .set(auth(adminToken))
      ).body as { subjects: { id: string }[] };
      const outra = subjects.find(
        (subject) => !teacher.subjects.some((item) => item.id === subject.id),
      )!;

      const response = await createClass({
        scheduledAt: todayAt(16),
        subjectId: outra.id,
      });

      expect(response.status).toBe(400);
      expect((response.body as { message: string }).message).toContain(
        'não leciona essa matéria',
      );
    });

    it('recusa horário fora do formato e duração fora da faixa', async () => {
      expect(
        (await createClass({ scheduledAt: '10/08/2026 14:00' })).status,
      ).toBe(400);
      expect(
        (await createClass({ scheduledAt: todayAt(17), durationMinutes: 5 }))
          .status,
      ).toBe(400);
      expect(
        (await createClass({ scheduledAt: todayAt(17), durationMinutes: 600 }))
          .status,
      ).toBe(400);
    });

    it('aluno não cria aula', async () => {
      await request(server)
        .post('/classes')
        .set(auth(alunoToken))
        .send({
          studentId,
          teacherId,
          subjectId,
          scheduledAt: todayAt(18),
          locationType: 'school',
        })
        .expect(403);
    });

    it('só o admin reabre uma aula', async () => {
      const created = await createClass({ scheduledAt: todayAt(6) });
      const aulaId = (created.body as { id: string }).id;

      await request(server)
        .patch(`/classes/${aulaId}/complete`)
        .set(auth(profToken))
        .expect(200);

      await request(server)
        .patch(`/classes/${aulaId}/reopen`)
        .set(auth(profToken))
        .expect(403);

      await request(server)
        .patch(`/classes/${aulaId}/reopen`)
        .set(auth(adminToken))
        .expect(200);
    });

    it('aula encerrada não aceita mudança de horário, só de observação', async () => {
      const created = await createClass({ scheduledAt: todayAt(5) });
      const aulaId = (created.body as { id: string }).id;

      await request(server)
        .patch(`/classes/${aulaId}/complete`)
        .set(auth(adminToken))
        .expect(200);

      await request(server)
        .patch(`/classes/${aulaId}`)
        .set(auth(adminToken))
        .send({ scheduledAt: todayAt(4) })
        .expect(400);

      await request(server)
        .patch(`/classes/${aulaId}`)
        .set(auth(adminToken))
        .send({ notes: 'observação depois de encerrada' })
        .expect(200);
    });

    it('não conclui aula duas vezes', async () => {
      const created = await createClass({ scheduledAt: todayAt(3) });
      const aulaId = (created.body as { id: string }).id;

      await request(server)
        .patch(`/classes/${aulaId}/complete`)
        .set(auth(adminToken))
        .expect(200);
      await request(server)
        .patch(`/classes/${aulaId}/complete`)
        .set(auth(adminToken))
        .expect(400);
    });

    it('reabrir não cria duas aulas agendadas no mesmo horário', async () => {
      const scheduledAt = todayAt(19);
      await liberarHorario(scheduledAt);

      const primeira = await createClass({ scheduledAt });
      expect(primeira.status).toBe(201);
      const primeiraId = (primeira.body as { id: string }).id;

      await request(server)
        .patch(`/classes/${primeiraId}/cancel`)
        .set(auth(adminToken))
        .expect(200);

      /* Cancelar liberou o horário: outra aula ocupa o lugar. */
      const segunda = await createClass({ scheduledAt });
      expect(segunda.status).toBe(201);

      /* Reabrir a primeira teria que ser recusado — o horário já é de outra. */
      const reabertura = await request(server)
        .patch(`/classes/${primeiraId}/reopen`)
        .set(auth(adminToken));

      expect(reabertura.status).toBe(409);

      const day = scheduledAt.slice(0, 10);
      const agenda = (
        await request(server)
          .get('/classes/agenda')
          .query({ from: day, to: day, status: ClassStatus.SCHEDULED })
          .set(auth(adminToken))
      ).body as { scheduledAt: string }[];

      expect(
        agenda.filter((item) => item.scheduledAt === `${scheduledAt}:00`),
      ).toHaveLength(1);
    });

    it('detalhe de aula inexistente devolve 404', async () => {
      await request(server)
        .get(`/classes/${UUID_INEXISTENTE}`)
        .set(auth(adminToken))
        .expect(404);
    });

    it('aluno não vê o valor cobrado no detalhe da aula', async () => {
      const created = await createClass({ scheduledAt: todayAt(2) });
      const aulaId = (created.body as { id: string }).id;

      await request(server)
        .patch(`/classes/${aulaId}/complete`)
        .set(auth(adminToken))
        .expect(200);

      const comoAluno = (
        await request(server)
          .get(`/classes/${aulaId}`)
          .set(auth(alunoToken))
          .expect(200)
      ).body as { amountCharged: string | null; commissionAmount: string | null };

      expect(comoAluno.amountCharged).toBeNull();
      expect(comoAluno.commissionAmount).toBeNull();

      const comoProfessor = (
        await request(server)
          .get(`/classes/${aulaId}`)
          .set(auth(profToken))
          .expect(200)
      ).body as { amountCharged: string | null; commissionAmount: string | null };

      expect(comoProfessor.commissionAmount).not.toBeNull();
      expect(comoProfessor.amountCharged).toBeNull();
    });
  });
});
