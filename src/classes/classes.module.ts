import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassesService } from './classes.service';
import { ClassesController } from './classes.controller';
import { ClassEntity } from './entity/class.entity';
import { StudentContractEntity } from '../student-contracts/entity/student-contract.entity';
import { TeacherEntity } from '../teachers/entity/teacher.entity';
import { PaymentEntity } from '../payments/entity/payment.entity';
import { RegionEntity } from '../regions/entity/region.entity';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassEntity,
      StudentContractEntity,
      TeacherEntity,
      PaymentEntity,
      RegionEntity,
    ]),
    WhatsappModule,
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
})
export class ClassesModule {}
