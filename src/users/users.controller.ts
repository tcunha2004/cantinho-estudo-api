import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UserSummaryDto } from './dto/user-summary.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { HashPasswordPipe } from './pipe/hash-password.pipe';
import { AuthGuard } from '../auth/guard/auth.guard';
import { RolesGuard } from '../auth/guard/roles.guard';
import { Roles } from '../auth/decorator/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashPassword: HashPasswordPipe,
  ) {}

  /* Lista para a tela de senhas do admin. */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Get()
  public async findAll(): Promise<UserSummaryDto[]> {
    return await this.usersService.findAll();
  }

  /*
   * Define uma senha nova para um usuário. É como o admin devolve acesso a
   * quem esqueceu a própria senha: a senha guardada é hash bcrypt e não pode
   * ser lida de volta, então recuperar é redefinir.
   */
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @Patch(':id/password')
  public async setPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPasswordDto,
  ): Promise<{ id: string }> {
    const user = await this.usersService.findById(id);

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const hash = await this.hashPassword.transform(dto.newPassword);
    await this.usersService.updatePassword(id, hash);

    return { id };
  }
}
