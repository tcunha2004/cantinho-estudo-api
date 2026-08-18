import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeachersService } from './teachers.service';
import { TeachersController } from './teachers.controller';
import { TeacherEntity } from './entity/teacher.entity';
import { UserEntity } from '../users/entity/user.entity';
import { SubjectEntity } from '../subjects/entity/subject.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TeacherEntity, UserEntity, SubjectEntity]),
  ],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
