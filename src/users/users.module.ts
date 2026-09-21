import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserEntity } from './entity/user.entity';
import { HashPasswordPipe } from './pipe/hash-password.pipe';
import { TypeOrmModule } from '@nestjs/typeorm';

/*
 * O controller não cria usuário — isso continua fora do HTTP: admin sai do
 * `npm run user:create`, aluno sai da aprovação de um cadastro
 * (SignupLinksService.approve()). O que ele expõe é a tela de senhas do admin:
 * listar quem existe e redefinir a senha de quem esqueceu a sua.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [UsersController],
  providers: [UsersService, HashPasswordPipe],
  exports: [UsersService],
})
export class UsersModule {}
