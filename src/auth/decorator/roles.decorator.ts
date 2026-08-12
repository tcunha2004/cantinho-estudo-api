import { SetMetadata } from '@nestjs/common';
import { UserRole } from 'src/users/entity/user.entity';

export const ROLES_KEY = 'roles';

/* Restringe uma rota aos papéis informados. Só tem efeito com o RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
