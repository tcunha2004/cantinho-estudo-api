import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserEntity } from './entity/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

/*
 * Sem controller de propósito: usuário não se cria por HTTP. Admin sai do
 * `npm run user:create`, aluno sai da aprovação de um cadastro
 * (SignupLinksService.approve()).
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
