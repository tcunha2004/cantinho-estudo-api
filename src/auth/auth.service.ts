import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { UserEntity, UserRole } from 'src/users/entity/user.entity';
import { JwtService } from '@nestjs/jwt';

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
  ) {}

  public async login({
    email,
    password,
  }: LoginDto): Promise<{ access_token: string }> {
    const user = await this.userService.findByEmail(email);

    const userAuthenticated = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !userAuthenticated) {
      throw new UnauthorizedException('O e-mail ou a senha está incorreto');
    }

    return this.signToken(user);
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
