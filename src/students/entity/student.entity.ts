import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entity/user.entity';
import { RegionEntity } from '../../regions/entity/region.entity';
import { StudentContractEntity } from '../../student-contracts/entity/student-contract.entity';

@Entity({ name: 'students' })
export class StudentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  @ManyToOne(() => RegionEntity, (region) => region.students, {
    nullable: false,
  })
  @JoinColumn({ name: 'region_id' })
  region: RegionEntity;

  @Column({ name: 'phone', length: 20, nullable: false })
  phone: string;

  /* Endereço para aulas em casa */
  @Column({ name: 'address', type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'active', type: 'boolean', default: true })
  active: boolean;

  @OneToMany(() => StudentContractEntity, (contract) => contract.student)
  contracts: StudentContractEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: string;
}
