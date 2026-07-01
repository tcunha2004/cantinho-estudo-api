import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GuardiansService } from './guardians.service';
import { GuardianEntity } from './entity/guardian.entity';

@Module({
  imports: [TypeOrmModule.forFeature([GuardianEntity])],
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
