import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentContractEntity } from '../../student-contracts/entity/student-contract.entity';
import { PaymentStatus } from '../enums/payment-status.enum';

@Entity({ name: 'payments' })
export class PaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(
    () => StudentContractEntity,
    (contract) => contract.payments,
    { nullable: false },
  )
  @JoinColumn({ name: 'student_contract_id' })
  studentContract: StudentContractEntity;

  /* Valor devido/pago nesta parcela */
  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
  })
  amount: string;

  @Column({ name: 'due_date', type: 'date', nullable: false })
  dueDate: string;

  /* Nulo se ainda não pago */
  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: string | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: PaymentStatus,
    nullable: false,
  })
  status: PaymentStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: string;
}
