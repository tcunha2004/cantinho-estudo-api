import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  @IsNotEmpty({ message: 'O e-mail não pode estar vazio' })
  email: string;

  @IsString({ message: 'A senha deve ser um texto' })
  @IsNotEmpty({ message: 'A senha não pode estar vazia' })
  password: string;
}
