import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from 'src/users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/* Chave de toda a autorização do sistema: 32 caracteres é o piso para não
 * valer a pena atacar o HMAC do token direto. */
const MIN_SECRET_LENGTH = 32;

/*
 * Falha no boot, não no primeiro login: secret ausente só apareceria quando
 * alguém tentasse entrar, e secret fraco não apareceria nunca.
 */
export function resolveJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');

  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET ausente ou curto — mínimo ${MIN_SECRET_LENGTH} caracteres`,
    );
  }

  return secret;
}

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: (configService: ConfigService) => ({
        secret: resolveJwtSecret(configService),
        signOptions: { expiresIn: '12h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
