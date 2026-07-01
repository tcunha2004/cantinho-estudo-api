import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentContractsService } from './student-contracts.service';
import { StudentContractsController } from './student-contracts.controller';
import { StudentContractEntity } from './entity/student-contract.entity';

@Module({
  imports: [TypeOrmModule.forFeature([StudentContractEntity])],
  controllers: [StudentContractsController],
  providers: [StudentContractsService],
})
export class StudentContractsModule {}
