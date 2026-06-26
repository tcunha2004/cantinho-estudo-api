import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentEntity } from '../../students/entity/student.entity';
import { PlanEntity } from '../../plans/entity/plan.entity';
import { ClassEntity } from '../../classes/entity/class.entity';
import { PaymentEntity } from '../../payments/entity/payment.entity';
import { ContractStatus } from '../enums/contract-status.enum';

@Entity({ name: 'student_contracts' })
export class StudentContractEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StudentEntity, (student) => student.contracts, {
    nullable: false,
  })
  @JoinColumn({ name: 'student_id' })
  student: StudentEntity;

  @ManyToOne(() => PlanEntity, (plan) => plan.contracts, { nullable: false })
  @JoinColumn({ name: 'plan_id' })
  plan: PlanEntity;

  @Column({ name: 'start_date', type: 'date', nullable: false })
  startDate: string;

  /* Preenchido para Bronze (2 meses) */
  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  /* Percentual de desconto aplicado via invite_link */
  @Column({
    name: 'discount_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  discountPercentage: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ContractStatus,
    nullable: false,
  })
  status: ContractStatus;

  @OneToMany(() => ClassEntity, (cls) => cls.studentContract)
  classes: ClassEntity[];

  @OneToMany(() => PaymentEntity, (payment) => payment.studentContract)
  payments: PaymentEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: string;
}
