import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UsersModule } from './users/users.module';
import { DbConfigService } from './config/db/db.config.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MyExceptionFilter } from './filter/exception-filter';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { ClassesModule } from './classes/classes.module';
import { StudentContractsModule } from './student-contracts/student-contracts.module';
import { GuardiansModule } from './guardians/guardians.module';
import { TeachersModule } from './teachers/teachers.module';
import { RegionsModule } from './regions/regions.module';
import { SubjectsModule } from './subjects/subjects.module';
import { SignupLinksModule } from './signup-links/signup-links.module';
import { PlansModule } from './plans/plans.module';
import { throttlerConfig } from './config/throttler.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      useFactory: throttlerConfig,
      inject: [ConfigService],
    }),
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
    RegionsModule,
    SubjectsModule,
    SignupLinksModule,
    PlansModule,
  ],
  providers: [
    /* Teto por IP em todas as rotas; as sensíveis apertam com @Throttle. */
    {
      provide: 'APP_GUARD',
      useClass: ThrottlerGuard,
    },
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
