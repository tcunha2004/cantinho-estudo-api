import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanEntity } from '../../plans/entity/plan.entity';

@Entity({ name: 'regions' })
export class RegionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', length: 100, nullable: false })
  name: string;

  @Column({ name: 'slug', length: 120, nullable: false, unique: true })
  slug: string;

  @Column({
    name: 'enrollment_fee',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: false,
  })
  enrollmentFee: string;

  @Column({ name: 'active', default: true })
  active: boolean;

  @OneToMany(() => PlanEntity, (plan) => plan.region)
  plans: PlanEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: string;
}
