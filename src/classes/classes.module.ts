import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { ClassEntity } from './entity/class.entity';
import { StudentContractEntity } from '../student-contracts/entity/student-contract.entity';
import { TeacherEntity } from '../teachers/entity/teacher.entity';
import { PlanEntity } from '../plans/entity/plan.entity';
import { RegionEntity } from '../regions/entity/region.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassEntity,
      StudentContractEntity,
      TeacherEntity,
      PlanEntity,
      RegionEntity,
    ]),
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
