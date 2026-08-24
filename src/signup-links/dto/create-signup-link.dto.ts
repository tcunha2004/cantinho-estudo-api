import { IsEmail, IsNotEmpty } from 'class-validator';

/*
 * O e-mail do aluno é a identidade do link: é a chave única de `users` e o
 * único dado que existe de um aluno que ainda não existe. É por ele que gerar
 * um link novo revoga o anterior do mesmo aluno — ver SignupLinksService.create().
 */
export class CreateSignupLinkDto {
  @IsNotEmpty({ message: 'E-mail do aluno é obrigatório' })
  @IsEmail({}, { message: 'E-mail inválido' })
  studentEmail: string;
}
