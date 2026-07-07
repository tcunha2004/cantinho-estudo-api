import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { StudentEntity } from './entity/student.entity';
import { PlanEntity } from '../plans/entity/plan.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StudentEntity, PlanEntity])],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
