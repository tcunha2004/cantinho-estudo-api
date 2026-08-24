import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entity/user.entity';
import { RegionEntity } from '../../regions/entity/region.entity';
import { PlanEntity } from '../../plans/entity/plan.entity';
import { StudentEntity } from '../../students/entity/student.entity';
import { SignupStatus } from '../enums/signup-status.enum';
import { naiveTimestampTransformer } from '../../utils/date-range.util';

/* Um responsável como o aluno preencheu — ver o comentário de `guardians`. */
export interface SignupGuardian {
  name: string;
  phone: string;
  cpf: string;
  rg: string | null;
  isFinancialResponsible: boolean;
}

/*
 * Rascunho do cadastro de um aluno: o admin gera o link, o aluno preenche por
 * fases (cada fase é um PATCH aqui) e envia. Só na aprovação do admin isso
 * vira `users` + `students` + `guardians` + `student_contracts` + `payments`
 * — ver SignupLinksService.approve().
 *
 * Tudo é nulo porque a linha nasce vazia e vai sendo preenchida; a
 * obrigatoriedade é cobrada no envio, não no banco.
 */
@Entity({ name: 'signup_links' })
export class SignupLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: SignupStatus,
    default: SignupStatus.PENDING,
  })
  status: SignupStatus;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy: UserEntity;

  @Column({ name: 'student_name', type: 'varchar', length: 80, nullable: true })
  studentName: string | null;

  @Column({
    name: 'student_email',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  studentEmail: string | null;

  @Column({
    name: 'student_phone',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  studentPhone: string | null;

  /* Endereço para aulas em casa — opcional, como em `students`. */
  @Column({ name: 'student_address', type: 'text', nullable: true })
  studentAddress: string | null;

  /*
   * Hash bcrypt da senha escolhida pelo aluno, gravado só no envio. Senha em
   * texto claro esperando aprovação no banco não vale a economia.
   */
  @Column({ name: 'password', type: 'varchar', length: 80, nullable: true })
  password: string | null;

  @ManyToOne(() => RegionEntity, { nullable: true })
  @JoinColumn({ name: 'region_id' })
  region: RegionEntity | null;

  @ManyToOne(() => PlanEntity, { nullable: true })
  @JoinColumn({ name: 'plan_id' })
  plan: PlanEntity | null;

  /*
   * Responsáveis como jsonb: a quantidade é variável, e isto é rascunho, não
   * domínio — vira linha em `guardians` de verdade só na aprovação.
   */
  @Column({ name: 'guardians', type: 'jsonb', nullable: true })
  guardians: SignupGuardian[] | null;

  /* Aluno gerado na aprovação — também é o que prova que o link já rodou. */
  @ManyToOne(() => StudentEntity, { nullable: true })
  @JoinColumn({ name: 'student_id' })
  student: StudentEntity | null;

  @CreateDateColumn({
    name: 'created_at',
    transformer: naiveTimestampTransformer,
  })
  createdAt: string;

  /*
   * Prazo do link. Revogar é antecipar isto para agora — não existe coluna
   * separada de "revogado" porque link revogado e link vencido morrem do mesmo
   * jeito em `findPending()`.
   */
  @Column({
    name: 'expires_at',
    type: 'timestamp',
    nullable: false,
    transformer: naiveTimestampTransformer,
  })
  expiresAt: string;

  @Column({
    name: 'submitted_at',
    type: 'timestamp',
    nullable: true,
    transformer: naiveTimestampTransformer,
  })
  submittedAt: string | null;

  @Column({
    name: 'approved_at',
    type: 'timestamp',
    nullable: true,
    transformer: naiveTimestampTransformer,
  })
  approvedAt: string | null;
}
