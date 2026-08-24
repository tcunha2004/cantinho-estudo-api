import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import * as bcrypt from 'bcrypt';
import { UserEntity, UserRole } from 'src/users/entity/user.entity';
import { JwtService } from '@nestjs/jwt';
import { HashPasswordPipe } from 'src/users/pipe/hash-password.pipe';

export interface UserPayload {
  sub: string;
  name: string;
  email: string;
  role: UserRole;
}

const DUMMY_PASSWORD_HASH =
  '$2b$12$Ehfrhxrx9d8CHKFZI58jPO7pmpe.Per8QyVRAdUTxBsQ7iw8o5bIW';

@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
    private readonly hashPassword: HashPasswordPipe,
  ) {}

  public async login({
    email,
    password,
    role,
  }: LoginDto): Promise<{ access_token: string }> {
    const user = await this.userService.findByEmailAndRole(email, role);

    const userAuthenticated = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !userAuthenticated) {
      throw new UnauthorizedException('O e-mail ou a senha está incorreto');
    }

    return this.signToken(user);
  }

  /*
   * O `userId` vem do token, nunca do corpo da requisição: cada um troca só a
   * própria senha. A senha atual é exigida para que um token vazado não baste
   * para tomar a conta de vez.
   */
  public async changePassword(
    userId: string,
    { currentPassword, newPassword }: ChangePasswordDto,
  ): Promise<void> {
    const user = await this.userService.findById(userId);

    const currentMatches = await bcrypt.compare(
      currentPassword,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    /* 400, não 401: no FE o 401 significa token inválido e derruba a sessão.
     * Errar a senha atual não pode deslogar quem está autenticado. */
    if (!user || !currentMatches) {
      throw new BadRequestException('A senha atual está incorreta');
    }

    if (currentPassword === newPassword) {
      throw new BadRequestException('A nova senha deve ser diferente da atual');
    }

    await this.userService.updatePassword(
      user.id,
      await this.hashPassword.transform(newPassword),
    );
  }

  private async signToken(user: UserEntity): Promise<{ access_token: string }> {
    const payload: UserPayload = {
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}
