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
import { TeacherEntity } from '../../teachers/entity/teacher.entity';
import { SubjectEntity } from '../../subjects/entity/subject.entity';
import { RegionEntity } from '../../regions/entity/region.entity';
import { LocationType } from '../enums/location-type.enum';
import { ClassStatus } from '../enums/class-status.enum';

@Entity({ name: 'classes' })
export class ClassEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(
    () => StudentContractEntity,
    (contract) => contract.classes,
    { nullable: false },
  )
  @JoinColumn({ name: 'student_contract_id' })
  studentContract: StudentContractEntity;

  @ManyToOne(() => TeacherEntity, (teacher) => teacher.classes, {
    nullable: false,
  })
  @JoinColumn({ name: 'teacher_id' })
  teacher: TeacherEntity;

  @ManyToOne(() => SubjectEntity, (subject) => subject.classes, {
    nullable: false,
  })
  @JoinColumn({ name: 'subject_id' })
  subject: SubjectEntity;

  /* Região da aula, congelada na conclusão (aluno pode trocar de região depois) */
  @ManyToOne(() => RegionEntity, { nullable: true })
  @JoinColumn({ name: 'region_id' })
  region: RegionEntity | null;

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: false })
  scheduledAt: string;

  @Column({ name: 'duration_minutes', type: 'int', default: 60 })
  durationMinutes: number;

  @Column({
    name: 'location_type',
    type: 'enum',
    enum: LocationType,
    nullable: false,
  })
  locationType: LocationType;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ClassStatus,
    nullable: false,
  })
  status: ClassStatus;

  /* Comissão do professor, congelada no momento da conclusão da aula */
  @Column({
    name: 'commission_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  commissionAmount: string | null;

  /* Observações da aula — opcional */
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: string;
}
