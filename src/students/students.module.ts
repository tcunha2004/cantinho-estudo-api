import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';
import { StudentEntity } from './entity/student.entity';
import { PlanEntity } from '../plans/entity/plan.entity';
import { PaymentEntity } from '../payments/entity/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudentEntity, PlanEntity, PaymentEntity]),
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
