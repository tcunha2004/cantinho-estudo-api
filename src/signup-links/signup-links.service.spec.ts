import { SignupLinksService } from './signup-links.service';
import { SignupStatus } from './enums/signup-status.enum';
import { SignupLinkEntity } from './entity/signup-link.entity';
import { UserEntity } from '../users/entity/user.entity';
import { StudentEntity } from '../students/entity/student.entity';
import { GuardianEntity } from '../guardians/entity/guardian.entity';
import { StudentContractEntity } from '../student-contracts/entity/student-contract.entity';
import { PaymentEntity } from '../payments/entity/payment.entity';
import { PlanType } from '../plans/enums/plan-type.enum';
import { Frequency } from '../plans/enums/frequency.enum';
import { ContractStatus } from '../student-contracts/enums/contract-status.enum';
import { PaymentStatus } from '../payments/enums/payment-status.enum';
import {
  addMinutesToNaive,
  nowNaive,
  todayNaive,
} from '../utils/date-range.util';

/*
 * O caminho de entrada de aluno novo. Duas coisas justificam o teste: a
 * aprovação é a única rotina do sistema que escreve em cinco tabelas de uma vez
 * (e em dinheiro), e o envio é a única barreira entre um formulário público e
 * um cadastro incompleto no banco.
 */

const region = {
  id: 'r1',
  name: 'Vila da Serra',
  enrollmentFee: '200.00',
};

const plan = {
  id: 'p1',
  planType: PlanType.OURO,
  frequency: Frequency.THREE_TIMES_WEEK,
  monthlyPrice: '1000.00',
  hourPrice: '100.00',
  classesCount: 12,
  validityMonths: null,
};

const guardian = {
  name: 'Marta Souza',
  phone: '(31) 98888-7777',
  cpf: '111.222.333-44',
  rg: null,
  isFinancialResponsible: true,
};

/* Rascunho pronto para envio — os testes tiram uma peça de cada vez. */
function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'link-1',
    status: SignupStatus.PENDING,
    studentName: 'Ana Souza',
    studentEmail: 'ana@teste.com',
    studentPhone: '(31) 90000-0000',
    studentAddress: 'Rua das Flores, 10',
    password: 'hash:senha123',
    region,
    plan,
    guardians: [guardian],
    submittedAt: null,
    /* Válido por padrão — quem testa prazo passa `expiresAt` no override. */
    expiresAt: addMinutesToNaive(nowNaive(), 60),
    ...overrides,
  };
}

function makeService() {
  const links = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: object) => Promise.resolve({ ...data, id: 'link-1' })),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
  };
  const users = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: object) => Promise.resolve({ ...data, id: 'u1' })),
  };
  const students = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: object) => Promise.resolve({ ...data, id: 's1' })),
  };
  const guardians = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
  };
  const contracts = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: object) => Promise.resolve({ ...data, id: 'c1' })),
  };
  const payments = {
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
  };

  const byEntity = new Map<unknown, unknown>([
    [SignupLinkEntity, links],
    [UserEntity, users],
    [StudentEntity, students],
    [GuardianEntity, guardians],
    [StudentContractEntity, contracts],
    [PaymentEntity, payments],
  ]);

  const manager = { getRepository: jest.fn((entity) => byEntity.get(entity)) };
  const dataSource = {
    transaction: jest.fn((run: (m: unknown) => unknown) => run(manager)),
  };
  const regionsService = {
    findPricing: jest.fn().mockResolvedValue([]),
    findPublicPricing: jest.fn().mockResolvedValue([]),
  };
  const hashPassword = {
    transform: jest.fn((value: string) => Promise.resolve(`hash:${value}`)),
  };

  const service = new SignupLinksService(
    links as never,
    users as never,
    regionsService as never,
    hashPassword as never,
    dataSource as never,
  );

  return {
    service,
    dataSource,
    links,
    users,
    students,
    guardians,
    contracts,
    payments,
    regionsService,
    hashPassword,
  };
}

describe('SignupLinksService', () => {
  afterEach(() => jest.useRealTimers());

  describe('create', () => {
    it('nasce pendente, com prazo, amarrado ao admin e ao e-mail do aluno', async () => {
      const { service, links } = makeService();
      /* 12:00 UTC = 09:00 em São Paulo; sete dias depois é 17/08 às 09:00. */
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T12:00:00.000Z'));

      await expect(
        service.create('admin-1', { studentEmail: 'ana@teste.com' }),
      ).resolves.toEqual({ id: 'link-1' });

      expect(links.create).toHaveBeenCalledWith({
        status: SignupStatus.PENDING,
        createdBy: { id: 'admin-1' },
        studentEmail: 'ana@teste.com',
        expiresAt: '2026-08-17T09:00:00',
      });
    });

    /* O caso do link perdido: o admin gera outro e o primeiro morre na hora. */
    it('revoga os links pendentes do mesmo aluno', async () => {
      const { service, links } = makeService();
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T12:00:00.000Z'));

      await service.create('admin-1', { studentEmail: 'ana@teste.com' });

      expect(links.update).toHaveBeenCalledWith(
        { studentEmail: 'ana@teste.com', status: SignupStatus.PENDING },
        { expiresAt: '2026-08-10T09:00:00' },
      );
    });

    it('recusa e-mail que já é de um usuário', async () => {
      const { service, users, links } = makeService();
      users.findOne.mockResolvedValue({ id: 'u9' });

      await expect(
        service.create('admin-1', { studentEmail: 'ana@teste.com' }),
      ).rejects.toThrow('Já existe um usuário com este e-mail');
      expect(links.save).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it('antecipa o vencimento do link', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(draft());
      jest.useFakeTimers().setSystemTime(new Date('2026-08-10T12:00:00.000Z'));

      await service.revoke('link-1');

      expect(links.update).toHaveBeenCalledWith('link-1', {
        expiresAt: '2026-08-10T09:00:00',
      });
    });
  });

  describe('findForm', () => {
    it('devolve o rascunho com a tabela de preços e sem a senha', async () => {
      const { service, links, regionsService } = makeService();
      links.findOne.mockResolvedValue(draft());
      regionsService.findPublicPricing.mockResolvedValue([{ id: 'r1' }]);

      const form = await service.findForm('link-1');

      expect(form).toEqual({
        id: 'link-1',
        studentName: 'Ana Souza',
        studentEmail: 'ana@teste.com',
        studentPhone: '(31) 90000-0000',
        studentAddress: 'Rua das Flores, 10',
        regionId: 'r1',
        planId: 'p1',
        guardians: [guardian],
        hasPassword: true,
        regions: [{ id: 'r1' }],
      });
      expect(JSON.stringify(form)).not.toContain('hash:senha123');
    });

    /* A tabela pública não pode carregar o que a escola paga ao professor. */
    it('pega a tabela de preços sem a comissão', async () => {
      const { service, links, regionsService } = makeService();
      links.findOne.mockResolvedValue(draft());

      await service.findForm('link-1');

      expect(regionsService.findPublicPricing).toHaveBeenCalled();
      expect(regionsService.findPricing).not.toHaveBeenCalled();
    });

    it('410 em link vencido ou revogado', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(
        draft({ expiresAt: addMinutesToNaive(nowNaive(), -1) }),
      );

      await expect(service.findForm('link-1')).rejects.toThrow(
        'Este link de cadastro expirou',
      );
    });

    it('404 em link inexistente', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(null);

      await expect(service.findForm('link-1')).rejects.toThrow(
        'Link de cadastro não encontrado',
      );
    });

    it('410 em link que já foi enviado', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(draft({ status: SignupStatus.WAITING }));

      await expect(service.findForm('link-1')).rejects.toThrow(
        'Este cadastro já foi enviado',
      );
    });
  });

  describe('updateDraft', () => {
    it('salva a fase sem mexer no status', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(draft());

      await service.updateDraft('link-1', {
        studentName: 'Ana Souza',
        regionId: 'r1',
        planId: 'p1',
      });

      expect(links.update).toHaveBeenCalledWith('link-1', {
        studentName: 'Ana Souza',
        region: { id: 'r1' },
        plan: { id: 'p1' },
      });
    });

    it('grava a senha em hash, nunca em texto claro', async () => {
      const { service, links, hashPassword } = makeService();
      links.findOne.mockResolvedValue(draft());

      await service.updateDraft('link-1', { password: 'senha123' });

      expect(hashPassword.transform).toHaveBeenCalledWith('senha123');
      expect(links.update).toHaveBeenCalledWith('link-1', {
        password: 'hash:senha123',
      });
    });

    it('normaliza RG vazio para nulo', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(draft());

      await service.updateDraft('link-1', {
        guardians: [{ ...guardian, rg: '  ' }],
      });

      expect(links.update).toHaveBeenCalledWith('link-1', {
        guardians: [{ ...guardian, rg: null }],
      });
    });

    it('recusa edição de link já enviado', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(draft({ status: SignupStatus.WAITING }));

      await expect(
        service.updateDraft('link-1', { studentName: 'Outra' }),
      ).rejects.toThrow('Este cadastro já foi enviado');
      expect(links.update).not.toHaveBeenCalled();
    });
  });

  describe('submit', () => {
    it('promove para waiting com a data do envio', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(draft());

      await service.submit('link-1');

      expect(links.update).toHaveBeenCalledWith('link-1', {
        status: SignupStatus.WAITING,
        submittedAt: expect.any(String) as string,
      });
    });

    /* A tela bloqueia o avanço por fase, mas ela não é a autoridade. */
    it.each([
      ['studentName', 'nome do aluno'],
      ['studentEmail', 'e-mail'],
      ['studentPhone', 'telefone'],
      ['password', 'senha'],
      ['region', 'região'],
      ['plan', 'plano'],
      ['guardians', 'responsáveis'],
    ])('recusa envio sem %s', async (field, message) => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(draft({ [field]: null }));

      await expect(service.submit('link-1')).rejects.toThrow(
        `Cadastro incompleto: falta ${message}`,
      );
      expect(links.update).not.toHaveBeenCalled();
    });

    it('recusa envio sem exatamente um responsável financeiro', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(
        draft({
          guardians: [guardian, { ...guardian, name: 'João Souza' }],
        }),
      );

      await expect(service.submit('link-1')).rejects.toThrow(
        'Informe exatamente um responsável financeiro',
      );
    });

    it('recusa e-mail que já existe', async () => {
      const { service, links, users } = makeService();
      links.findOne.mockResolvedValue(draft());
      users.findOne.mockResolvedValue({ id: 'u-existente' });

      await expect(service.submit('link-1')).rejects.toThrow(
        'Já existe um usuário com este e-mail',
      );
      expect(links.update).not.toHaveBeenCalled();
    });
  });

  describe('findWaiting', () => {
    it('lista os cadastros aguardando com plano e região', async () => {
      const { service, links } = makeService();
      links.find.mockResolvedValue([
        draft({
          status: SignupStatus.WAITING,
          submittedAt: '2026-08-20 10:00:00',
        }),
      ]);

      await expect(service.findWaiting()).resolves.toEqual([
        {
          id: 'link-1',
          studentName: 'Ana Souza',
          studentEmail: 'ana@teste.com',
          studentPhone: '(31) 90000-0000',
          studentAddress: 'Rua das Flores, 10',
          regionName: 'Vila da Serra',
          enrollmentFee: '200.00',
          planId: 'p1',
          planType: PlanType.OURO,
          frequency: Frequency.THREE_TIMES_WEEK,
          monthlyPrice: '1000.00',
          hourPrice: '100.00',
          classesCount: 12,
          validityMonths: null,
          guardians: [guardian],
          submittedAt: '2026-08-20 10:00:00',
        },
      ]);
      expect(links.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: SignupStatus.WAITING } }),
      );
    });
  });

  describe('approve', () => {
    const waiting = () => draft({ status: SignupStatus.WAITING });

    it('cria usuário, aluno, responsáveis, contrato e primeira parcela', async () => {
      const {
        service,
        links,
        users,
        students,
        guardians,
        contracts,
        payments,
      } = makeService();
      links.findOne.mockResolvedValue(waiting());

      await expect(
        service.approve('link-1', { discountPercentage: '10' }),
      ).resolves.toEqual({ studentId: 's1' });

      expect(users.create).toHaveBeenCalledWith({
        name: 'Ana Souza',
        email: 'ana@teste.com',
        password: 'hash:senha123',
        role: 'student',
      });
      expect(students.create).toHaveBeenCalledWith({
        user: expect.objectContaining({ id: 'u1' }) as object,
        region,
        phone: '(31) 90000-0000',
        address: 'Rua das Flores, 10',
        active: true,
      });
      expect(guardians.create).toHaveBeenCalledWith({
        ...guardian,
        student: expect.objectContaining({ id: 's1' }) as object,
      });

      const today = todayNaive();
      expect(contracts.create).toHaveBeenCalledWith({
        student: expect.objectContaining({ id: 's1' }) as object,
        plan,
        startDate: today,
        /* Ouro sem validade em meses vai até dezembro do ano de início. */
        endDate: `${today.slice(0, 4)}-12-31`,
        discountPercentage: '10.00',
        status: ContractStatus.ACTIVE,
      });
      expect(payments.create).toHaveBeenCalledWith({
        studentContract: expect.objectContaining({ id: 'c1' }) as object,
        /* 1000 com 10% de desconto */
        amount: '900.00',
        dueDate: `${today.slice(0, 7)}-10`,
        paidAt: null,
        status: PaymentStatus.PENDING,
      });
      expect(links.update).toHaveBeenCalledWith('link-1', {
        status: SignupStatus.APPROVED,
        approvedAt: expect.any(String) as string,
        student: { id: 's1' },
      });
    });

    it('sem desconto a mensalidade é o preço cheio', async () => {
      const { service, links, contracts, payments } = makeService();
      links.findOne.mockResolvedValue(waiting());

      await service.approve('link-1', {});

      expect(contracts.create).toHaveBeenCalledWith(
        expect.objectContaining({ discountPercentage: null }),
      );
      expect(payments.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '1000.00' }),
      );
    });

    /* Um `users` órfão queimaria o e-mail e impediria refazer o cadastro. */
    it('roda tudo dentro de uma transação', async () => {
      const { service, links, dataSource } = makeService();
      links.findOne.mockResolvedValue(waiting());

      await service.approve('link-1', {});

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('recusa cadastro que não está aguardando', async () => {
      const { service, links, users } = makeService();
      links.findOne.mockResolvedValue(draft({ status: SignupStatus.APPROVED }));

      await expect(service.approve('link-1', {})).rejects.toThrow(
        'Este cadastro não está aguardando aprovação',
      );
      expect(users.create).not.toHaveBeenCalled();
    });

    it('404 em cadastro inexistente', async () => {
      const { service, links } = makeService();
      links.findOne.mockResolvedValue(null);

      await expect(service.approve('link-1', {})).rejects.toThrow(
        'Cadastro não encontrado',
      );
    });

    /* Entre o envio e a aprovação alguém pode ter cadastrado o mesmo e-mail. */
    it('recusa e-mail que ficou duplicado no meio do caminho', async () => {
      const { service, links, users } = makeService();
      links.findOne.mockResolvedValue(waiting());
      users.findOne.mockResolvedValue({ id: 'u-existente' });

      await expect(service.approve('link-1', {})).rejects.toThrow(
        'Já existe um usuário com este e-mail',
      );
      expect(users.create).not.toHaveBeenCalled();
    });
  });
});
