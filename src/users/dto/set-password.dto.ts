import { IsString, MinLength } from 'class-validator';

/* Senha definida pelo admin para um usuário que perdeu a sua. Sem senha atual:
 * quem chama é o admin, não o dono da conta — a rota é @Roles('admin'). */
export class SetPasswordDto {
  @IsString({ message: 'A senha deve ser um texto' })
  @MinLength(6, { message: 'A nova senha deve ter pelo menos 6 caracteres' })
  newPassword: string;
}
