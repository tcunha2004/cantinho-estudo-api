import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'src/users/entity/user.entity';
import { ROLES_KEY } from '../decorator/roles.decorator';
import type { RequestWithUser } from './auth.guard';

/*
 * Autorização por papel. Depende do AuthGuard ter rodado antes para popular
 * `request.user` — por isso a ordem em `@UseGuards(AuthGuard, RolesGuard)`.
 * Rota sem @Roles passa direto.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!allowed?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!allowed.includes(request.user.role)) {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }

    return true;
  }
}
