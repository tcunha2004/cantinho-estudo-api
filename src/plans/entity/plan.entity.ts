import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { RegionEntity } from '../../regions/entity/region.entity';
import { Frequency } from '../enums/frequency.enum';
import { PlanType } from '../enums/plan-type.enum';

@Entity({ name: 'plans' })
@Unique('uq_plan', ['region', 'planType', 'frequency'])
export class PlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RegionEntity, (region) => region.plans, {
    nullable: false,
  })
  @JoinColumn({ name: 'region_id' })
  region: RegionEntity;

  @Column({
    name: 'plan_type',
    type: 'enum',
    enum: PlanType,
    nullable: false,
  })
  planType: PlanType;

  @Column({
    name: 'frequency',
    type: 'enum',
    enum: Frequency,
    nullable: true,
  })
  frequency: Frequency | null;

  @Column({
    name: 'monthly_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
  })
  monthlyPrice: string;

  @Column({
    name: 'hour_price',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
  })
  hourPrice: string;

  /* Quantidade de aulas no mês */
  @Column({ name: 'classes_count', type: 'int', nullable: true })
  classesCount: number | null;

  /* Validade do pacote em meses (2 apenas para o Bronze) */
  @Column({ name: 'validity_months', type: 'int', nullable: true })
  validityMonths: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: string;
}
