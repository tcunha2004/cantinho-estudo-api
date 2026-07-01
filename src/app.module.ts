import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { DbConfigService } from './config/db/db.config.service';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MyExceptionFilter } from './filter/exception-filter';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { ClassesModule } from './classes/classes.module';
import { StudentContractsModule } from './student-contracts/student-contracts.module';
import { GuardiansModule } from './guardians/guardians.module';
import { TeachersModule } from './teachers/teachers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useClass: DbConfigService,
    }),
    UsersModule,
    AuthModule,
    StudentsModule,
    ClassesModule,
    StudentContractsModule,
    GuardiansModule,
    TeachersModule,
  ],
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
