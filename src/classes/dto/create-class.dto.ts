import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LocationType } from '../enums/location-type.enum';

export class CreateClassDto {
  @IsUUID()
  studentId: string;

  /* Obrigatório para admin; ignorado para professor, que só agenda para si */
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @IsUUID()
  subjectId: string;

  /*
   * Horário local ingênuo, no formato que o `<input type="datetime-local">`
   * produz. Sem 'Z' e sem offset — ver a nota de fuso em date-range.util.ts.
   */
  @Matches(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/, {
    message: 'scheduledAt deve estar no formato YYYY-MM-DDTHH:mm',
  })
  scheduledAt: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;

  @IsEnum(LocationType)
  locationType: LocationType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
