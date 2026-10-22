import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { UazapiClient } from './uazapi.client';
import { WhatsappInstanceEntity } from './entity/whatsapp-instance.entity';
import { WhatsappMessageEntity } from './entity/whatsapp-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappInstanceEntity, WhatsappMessageEntity]),
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, UazapiClient],
  exports: [WhatsappService],
})
export class WhatsappModule {}
