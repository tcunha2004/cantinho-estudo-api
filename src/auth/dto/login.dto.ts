import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  @IsNotEmpty({ message: 'O e-mail não pode estar vazio' })
  email: string;

  @IsString({ message: 'A senha deve ser um texto' })
  @IsNotEmpty({ message: 'A senha não pode estar vazia' })
  password: string;

  @IsEnum(['admin', 'professor', 'student'], {
    message: 'Cargo deve ser um dos seguintes: admin, professor, student',
  })
  @IsNotEmpty({ message: 'O cargo não pode estar vazio' })
  role: 'admin' | 'professor' | 'student';
}
