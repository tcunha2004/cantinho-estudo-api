import { Body, Controller, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthGuard } from './guard/auth.guard';
import type { RequestWithUser } from './guard/auth.guard';
import { LOGIN_THROTTLE } from '../config/throttler.config';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /* Sem isto, tentar senha até acertar é de graça. */
  @Throttle(LOGIN_THROTTLE)
  @Post('login')
  async login(
    @Body() { email, password, role }: LoginDto,
  ): Promise<{ access_token: string }> {
    return this.authService.login({ email, password, role });
  }

  /* Mesmo limite do login: é caminho de senha e roda bcrypt a cada chamada. */
  @Throttle(LOGIN_THROTTLE)
  @UseGuards(AuthGuard)
  @Patch('password')
  async changePassword(
    @Req() request: RequestWithUser,
    @Body() body: ChangePasswordDto,
  ): Promise<void> {
    return this.authService.changePassword(request.user.sub, body);
  }
}
