import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entity/user.entity';
import { TargetRole } from '../enums/target-role.enum';

@Entity({ name: 'invite_links' })
export class InviteLinkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'created_by' })
  createdBy: UserEntity;

  @Column({ name: 'token', nullable: false, unique: true })
  token: string;

  @Column({
    name: 'target_role',
    type: 'enum',
    enum: TargetRole,
    nullable: false,
  })
  targetRole: TargetRole;

  /* Percentual de desconto — nulo se sem desconto */
  @Column({
    name: 'discount_percentage',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  discountPercentage: string | null;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: false })
  expiresAt: string;

  @Column({ name: 'used', default: false })
  used: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;
}
