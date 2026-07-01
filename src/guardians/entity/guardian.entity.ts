import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentEntity } from '../../students/entity/student.entity';

@Entity({ name: 'guardians' })
export class GuardianEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StudentEntity, (student) => student.guardians, {
    nullable: false,
  })
  @JoinColumn({ name: 'student_id' })
  student: StudentEntity;

  @Column({ name: 'name', type: 'varchar', length: 80, nullable: false })
  name: string;

  @Column({ name: 'phone', type: 'varchar', length: 20, nullable: false })
  phone: string;

  @Column({ name: 'cpf', type: 'varchar', length: 14, nullable: false })
  cpf: string;

  @Column({ name: 'rg', type: 'varchar', length: 20, nullable: true })
  rg: string | null;

  /* Indica se este responsável é o responsável financeiro do aluno */
  @Column({
    name: 'is_financial_responsible',
    type: 'boolean',
    default: false,
  })
  isFinancialResponsible: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: string;
}
