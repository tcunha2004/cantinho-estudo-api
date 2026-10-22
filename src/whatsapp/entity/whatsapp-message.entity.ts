import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StudentEntity } from '../../students/entity/student.entity';
import { WhatsappMessageStatus } from '../enums/whatsapp-message-status.enum';
import { naiveTimestampTransformer } from '../../utils/date-range.util';

/*
 * Histórico do que o sistema mandou (ou tentou mandar) por WhatsApp. A linha
 * nasce `pending` antes da chamada à UAZAPI, para uma queda no meio do envio
 * não deixar o aviso sumir sem rastro — ver WhatsappService.
 */
@Entity({ name: 'whatsapp_messages' })
export class WhatsappMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /* Por que a mensagem existe, ex. 'signup_approved'. */
  @Column({ name: 'kind', length: 40, nullable: false })
  kind: string;

  /* Como estava no cadastro, sem normalizar — a normalização é no envio. */
  @Column({ name: 'phone', length: 30, nullable: false })
  phone: string;

  @Column({ name: 'text', type: 'text', nullable: false })
  text: string;

  @Index('IDX_whatsapp_messages_status')
  @Column({
    name: 'status',
    type: 'enum',
    enum: WhatsappMessageStatus,
    default: WhatsappMessageStatus.PENDING,
    nullable: false,
  })
  status: WhatsappMessageStatus;

  @Column({ name: 'error', type: 'text', nullable: true })
  error: string | null;

  @ManyToOne(() => StudentEntity, { nullable: true })
  @JoinColumn({ name: 'student_id' })
  student: StudentEntity | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    transformer: naiveTimestampTransformer,
  })
  createdAt: string;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    transformer: naiveTimestampTransformer,
  })
  updatedAt: string;
}
