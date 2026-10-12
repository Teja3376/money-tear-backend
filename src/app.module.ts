import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createObserveModule } from '@nestjs/observe';

import { CONFIG_NAMESPACE, buildConfiguration, getAppConfig } from '@/config/configuration';
import { validateEnv } from '@/config/validation';
import { buildSslOptions } from '@/database/data-source';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { AccountStatusGuard } from '@/common/guards/account-status.guard';
import { RequestIdInterceptor } from '@/common/interceptors/request-id.interceptor';
import { AppValidationPipe } from '@/common/pipes/validation.pipe';
import { AuthCoreModule } from '@/modules/auth/auth-core.module';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { AuthModule } from '@/modules/auth/auth.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { HealthModule } from '@/modules/health/health.module';
import { SecurityModule } from '@/modules/security/security.module';
import { UsersModule } from '@/modules/users/users.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

const OBSERVE_UNSET_APP_KEY = 'YOUR_APP_KEY';
const OBSERVE_UNSET_APP_SECRET = 'YOUR_APP_SECRET';

function observeCredentials(): { appKey: string; appSecret: string } {
  const env = validateEnv(process.env);
  return {
    appKey: env.OBSERVE_APP_KEY || OBSERVE_UNSET_APP_KEY,
    appSecret: env.OBSERVE_APP_SECRET || OBSERVE_UNSET_APP_SECRET,
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Validated before anything else is constructed: a missing or malformed
      // variable aborts startup with a message naming the offending keys.
      validate: validateEnv,
      // Nested under the `app` namespace so it never collides with the raw
      // environment keys, and so `ConfigService.get('app', { infer: true })` is
      // fully typed.
      load: [() => ({ [CONFIG_NAMESPACE]: buildConfiguration(validateEnv(process.env)) })],
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = getAppConfig(config);
        return {
          throttlers: [
            {
              name: 'default',
              ttl: app.rateLimit.ttlMs,
              limit: app.rateLimit.max,
            },
          ],
        };
      },
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      // Built from the already-validated configuration rather than re-parsing
      // process.env, so the connection can only ever use vetted values.
      useFactory: (config: ConfigService) => {
        const database = getAppConfig(config).database;
        return {
          type: 'postgres' as const,
          host: database.host,
          port: database.port,
          username: database.username,
          password: database.password,
          database: database.database,
          ssl: buildSslOptions(database.ssl, database.sslRejectUnauthorized),
          extra: { max: database.poolSize },
          autoLoadEntities: true,
          // Hard rule: schema changes only through migrations.
          synchronize: false,
          migrationsRun: false,
          migrationsTableName: 'moneytear_migrations',
          logging: false,
        };
      },
    }),

    // Existing observability integration - preserved unchanged. Stays inert until
    // real OBSERVE_APP_KEY / OBSERVE_APP_SECRET values are configured.
    ObserveModule.forRoot({
      ...observeCredentials(),
      serviceId: 'money-tear-backend',
    }),

    AuditModule,
    UsersModule,
    SecurityModule,
    AuthCoreModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Guard order matters:
    //  1. throttle first, so a flood never reaches crypto or the database;
    //  2. verify the Supabase token next - everything after it can rely on
    //     `request.user` being a verified identity;
    //  3. account status last, which reads the application user.
    // Routes opt out of authentication explicitly with `@Public()`.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccountStatusGuard },
    { provide: APP_PIPE, useClass: AppValidationPipe },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
  ],
})
export class AppModule {}
