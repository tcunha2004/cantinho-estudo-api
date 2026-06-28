import { Exclude } from 'class-transformer';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

type UserRole = 'admin' | 'professor' | 'student';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', length: 80, nullable: false })
  name: string;

  @Column({
    name: 'email',
    length: 150,
    nullable: false,
    unique: true,
  })
  email: string;

  @Column({ name: 'password', length: 80, nullable: false })
  @Exclude()
  password: string;

  @Column({ name: 'role', nullable: false })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: string;
}
