import { NamedRefDto } from './agenda-class.dto';

export class TeacherOptionDto extends NamedRefDto {
  /* Cada professor já carrega as próprias matérias: trocar de professor no
   * formulário não custa uma nova requisição. */
  subjects: NamedRefDto[];
}

/*
 * Opções dos selects do formulário de aula, escopadas pelo papel:
 * admin recebe `teachers` (com as matérias de cada um) e `subjects` vazio;
 * professor recebe `subjects` (as dele) e `teachers` vazio.
 */
export class ClassFormOptionsDto {
  teachers: TeacherOptionDto[];
  subjects: NamedRefDto[];
  students: NamedRefDto[];
}
