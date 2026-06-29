import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { DbConfigService } from './config/db/db.config.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MyExceptionFilter } from './filter/exception-filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useClass: DbConfigService,
    }),
    UsersModule,
  ],
  controllers: [],
  providers: [
    {
      provide: 'APP_FILTER',
      useClass: MyExceptionFilter,
    },
    {
      provide: 'APP_INTERCEPTOR',
      useClass: ClassSerializerInterceptor,
    },
  ],
})
export class AppModule {}
