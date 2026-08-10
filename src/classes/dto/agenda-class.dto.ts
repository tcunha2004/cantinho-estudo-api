import { ClassStatus } from '../enums/class-status.enum';
import { LocationType } from '../enums/location-type.enum';

export class NamedRefDto {
  id: string;
  name: string;
}

/*
 * Aula como a grade da agenda precisa dela: plana e sem o grafo da entidade.
 * Horários são strings ingênuas ('YYYY-MM-DDTHH:mm:ss', sem fuso) — ver
 * `utils/date-range.util.ts`.
 */
export class AgendaClassDto {
  id: string;
  scheduledAt: string;
  /* Fim já calculado a partir da duração, para a grade não refazer a conta */
  endsAt: string;
  durationMinutes: number;
  status: ClassStatus;
  locationType: LocationType;
  subject: NamedRefDto;
  teacher: NamedRefDto;
  student: NamedRefDto;
}
