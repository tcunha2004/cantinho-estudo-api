import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { StudentEntity } from './entity/student.entity';
import { PlanEntity } from '../plans/entity/plan.entity';
import { PaymentEntity } from '../payments/entity/payment.entity';
import { ClassEntity } from '../classes/entity/class.entity';
import { UserEntity } from '../users/entity/user.entity';
import { StudentContractsModule } from '../student-contracts/student-contracts.module';
import { GuardiansModule } from '../guardians/guardians.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentEntity,
      PlanEntity,
      PaymentEntity,
      ClassEntity,
      UserEntity,
    ]),
    StudentContractsModule,
    GuardiansModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
