import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentContractsService } from './student-contracts.service';
import { StudentContractsController } from './student-contracts.controller';
import { StudentContractEntity } from './entity/student-contract.entity';
import { ClassEntity } from '../classes/entity/class.entity';
import { PaymentEntity } from '../payments/entity/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudentContractEntity, ClassEntity, PaymentEntity]),
  ],
  controllers: [StudentContractsController],
  providers: [StudentContractsService],
  exports: [StudentContractsService],
})
export class StudentContractsModule {}
