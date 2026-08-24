import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
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
}
