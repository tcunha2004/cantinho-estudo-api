import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignupLinksService } from './signup-links.service';
import { SignupLinksController } from './signup-links.controller';
import { SignupLinkEntity } from './entity/signup-link.entity';
import { UserEntity } from '../users/entity/user.entity';
import { HashPasswordPipe } from '../users/pipe/hash-password.pipe';
import { RegionsModule } from '../regions/regions.module';
import { SubjectsModule } from '../subjects/subjects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SignupLinkEntity, UserEntity]),
    RegionsModule,
    SubjectsModule,
  ],
  controllers: [SignupLinksController],
  /* O pipe entra como provider porque o hash da senha acontece no service,
   * não num parâmetro de rota — é o mesmo bcrypt do cadastro de usuário. */
  providers: [SignupLinksService, HashPasswordPipe],
})
export class SignupLinksModule {}
