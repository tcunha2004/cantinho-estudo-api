import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TeacherEntity } from '../../teachers/entity/teacher.entity';
import { ClassEntity } from '../../classes/entity/class.entity';

@Entity({ name: 'subjects' })
export class SubjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name', length: 100, nullable: false })
  name: string;

  @ManyToMany(() => TeacherEntity, (teacher) => teacher.subjects)
  teachers: TeacherEntity[];

  @OneToMany(() => ClassEntity, (cls) => cls.subject)
  classes: ClassEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;
}
