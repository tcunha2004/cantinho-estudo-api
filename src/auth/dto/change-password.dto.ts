import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString({ message: 'A senha deve ser um texto' })
  @IsNotEmpty({ message: 'A senha atual não pode estar vazia' })
  currentPassword: string;

  @IsString({ message: 'A senha deve ser um texto' })
  @MinLength(6, { message: 'A nova senha deve ter pelo menos 6 caracteres' })
  newPassword: string;
}
