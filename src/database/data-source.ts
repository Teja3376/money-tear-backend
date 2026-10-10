import { DataSource, type DataSourceOptions } from 'typeorm';

/** Postgres TLS configuration; `false` disables TLS entirely. */
type SslOption = { rejectUnauthorized: boolean } | false;
import { validateEnv } from '@/config/validation';
import { AuthAuditEvent } from '@/modules/audit/entities/auth-audit-event.entity';
import { UserSecurity } from '@/modules/security/entities/user-security.entity';
import { User } from '@/modules/users/entities/user.entity';
import { InitialSchema1730000000000 } from '@/database/migrations/1730000000000-InitialSchema';

/**
 * Every entity is listed explicitly. Glob discovery is deliberately avoided: it
 * behaves differently between `src` (ts) and `dist` (js) and silently omits
 * entities when a path pattern misses - a failing migration is always better than
 * a half-discovered schema.
 */
export const ENTITIES = [User, UserSecurity, AuthAuditEvent];

export const MIGRATIONS = [InitialSchema1730000000000];

/** Derives the TLS option from the boolean settings. */
export function buildSslOptions(enabled: boolean, rejectUnauthorized: boolean): SslOption {
  if (!enabled) {
    return false;
  }
  return { rejectUnauthorized };
}

/** Shared option factory used by both the Nest module and the migration CLI. */
export function buildDataSourceOptions(
  env: ReturnType<typeof validateEnv>,
): DataSourceOptions {
  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: buildSslOptions(env.DB_SSL, env.DB_SSL_REJECT_UNAUTHORIZED),
    entities: ENTITIES,
    migrations: MIGRATIONS,
    // Hard rules for this project - never flip these.
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: 'moneytear_migrations',
    logging: false,
  };
}

/**
 * Standalone DataSource for the TypeORM CLI and the migration CLI.
 *
 * `dotenv`-style loading is unnecessary: `ConfigModule` loads `.env` for the app,
 * and the CLI scripts run through the same process env (see `package.json`).
 */
export function createDataSource(): DataSource {
  return new DataSource(buildDataSourceOptions(validateEnv()));
}

export default createDataSource;