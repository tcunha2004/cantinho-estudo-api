import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { ClassStatus } from '../enums/class-status.enum';

const DATE_FORMAT = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class AgendaQueryDto {
  /* Primeiro dia do intervalo, no formato YYYY-MM-DD */
  @Matches(DATE_FORMAT, { message: 'from deve estar no formato YYYY-MM-DD' })
  from: string;

  /* Último dia do intervalo (inclusive). Igual a `from` na visualização de dia. */
  @Matches(DATE_FORMAT, { message: 'to deve estar no formato YYYY-MM-DD' })
  to: string;

  /* Filtros só honrados para admin — professor e aluno já são escopados pelo token */
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsOptional()
  @IsUUID()
  studentId?: string;

  @IsOptional()
  @IsEnum(ClassStatus)
  status?: ClassStatus;
}
