import { PartialType } from '@nestjs/mapped-types';
import { CreateClassDto } from './create-class.dto';

/*
 * Todos os campos da criação, opcionais. `status` fica de fora de propósito:
 * concluir uma aula precisa congelar região, comissão e valor cobrado — de que
 * dependem todos os relatórios de receita. Cancelar tem rota própria.
 */
export class UpdateClassDto extends PartialType(CreateClassDto) {}
