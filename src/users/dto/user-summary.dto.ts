import { UserRole } from '../entity/user.entity';

/*
 * Usuário como a tela de senhas do admin o vê. Montado campo a campo de
 * propósito: o hash nunca entra no objeto, sem depender do @Exclude() da
 * entidade nem do interceptor de serialização estar ativo.
 */
export class UserSummaryDto {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
