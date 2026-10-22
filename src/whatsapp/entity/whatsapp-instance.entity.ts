import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { naiveTimestampTransformer } from '../../utils/date-range.util';

/*
 * Instância da UAZAPI criada pelo próprio sistema. Na prática é uma linha só
 * (o WhatsApp do admin); o serviço sempre lê a mais recente.
 */
@Entity({ name: 'whatsapp_instance' })
export class WhatsappInstanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /* Token da instância na UAZAPI — nunca sai da API. */
  @Column({ name: 'token', length: 255, nullable: false })
  token: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    transformer: naiveTimestampTransformer,
  })
  createdAt: string;
}
