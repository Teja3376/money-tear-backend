import { describe, expect, it } from 'vitest';
import type { QueryRunner } from 'typeorm';
import { InitialSchema1730000000000 } from '@/database/migrations/1730000000000-InitialSchema';
import { buildDataSourceOptions, ENTITIES, MIGRATIONS } from '@/database/data-source';
import { validateEnv } from '@/config/validation';
import { testEnv } from '@test/test-env';

/** Postgres variant of the union returned by `buildDataSourceOptions`. */
type PostgresOptions = Extract<ReturnType<typeof buildDataSourceOptions>, { type: 'postgres' }>;

/** Captures the SQL a migration would run, without touching a real database. */
function recordingQueryRunner() {
  const queries: string[] = [];
  const runner = {
    query: async (sql: string) => {
      queries.push(sql);
      return [];
    },
  } as unknown as QueryRunner;
  return { runner, queries };
}

describe('InitialSchema migration', () => {
  it('is registered as the only migration', () => {
    expect(MIGRATIONS).toHaveLength(1);
    expect(MIGRATIONS[0]).toBe(InitialSchema1730000000000);
  });

  it('declares a down() that only drops what up() created', async () => {
    const migration = new InitialSchema1730000000000();
    const { runner, queries } = recordingQueryRunner();

    await migration.down(runner);

    const dropped = queries.join('\n');
    for (const table of ['users', 'user_security', 'auth_audit_events']) {
      expect(dropped).toContain(`DROP TABLE IF EXISTS "${table}"`);
    }
    // Must not touch Supabase-owned objects.
    expect(dropped).not.toContain('auth"."users');
  });

  describe('up()', () => {
    it('creates the three application tables', async () => {
      const migration = new InitialSchema1730000000000();
      const { runner, queries } = recordingQueryRunner();

      await migration.up(runner);
      const sql = queries.join('\n');

      expect(sql).toContain('CREATE TABLE "users"');
      expect(sql).toContain('CREATE TABLE "user_security"');
      expect(sql).toContain('CREATE TABLE "auth_audit_events"');
    });

    it('preserves the identity foreign key to auth.users', async () => {
      const migration = new InitialSchema1730000000000();
      const { runner, queries } = recordingQueryRunner();

      await migration.up(runner);
      const sql = queries.join('\n');

      // The FK is retained even though the application never writes auth.users.
      expect(sql).toContain('REFERENCES "auth"."users"("id")');
      expect(sql).toContain('ON DELETE CASCADE');
    });

    it('uses snake_case columns and timestamptz / date types', async () => {
      const migration = new InitialSchema1730000000000();
      const { runner, queries } = recordingQueryRunner();

      await migration.up(runner);
      const sql = queries.join('\n');

      expect(sql).toContain('"first_name"');
      expect(sql).toContain('"last_name"');
      expect(sql).toContain('"date_of_birth" date');
      expect(sql).toContain('"pin_hash" text');
      expect(sql).toContain('"failed_pin_attempts" integer');
      expect(sql).toContain('"locked_until" TIMESTAMP WITH TIME ZONE');
      expect(sql).toContain('"onboarding_completed_at" TIMESTAMP WITH TIME ZONE');
    });

    it('adds the indexes required for lookups and lockout checks', async () => {
      const migration = new InitialSchema1730000000000();
      const { runner, queries } = recordingQueryRunner();

      await migration.up(runner);
      const sql = queries.join('\n');

      expect(sql).toContain('CREATE UNIQUE INDEX "idx_users_phone"');
      expect(sql).toContain('CREATE INDEX "idx_users_status"');
      expect(sql).toContain('idx_auth_audit_events_user_created');
      expect(sql).toContain('idx_auth_audit_events_type_created');
    });

    it('adds database-level check constraints for server-owned fields', async () => {
      const migration = new InitialSchema1730000000000();
      const { runner, queries } = recordingQueryRunner();

      await migration.up(runner);
      const sql = queries.join('\n');

      expect(sql).toContain('CHK_users_status');
      expect(sql).toContain('CHK_users_role');
      expect(sql).toContain('CHK_user_security_failed_attempts');
      expect(sql).toContain('CHK_auth_audit_events_event_type');
    });

    it('enables RLS and revokes Data API access', async () => {
      const migration = new InitialSchema1730000000000();
      const { runner, queries } = recordingQueryRunner();

      await migration.up(runner);
      const sql = queries.join('\n');

      // Clients (PostgREST) must not be able to read application tables.
      expect(sql).toContain('ALTER TABLE "users" ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE "user_security" ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('ALTER TABLE "auth_audit_events" ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('REVOKE ALL ON TABLE');
      expect(sql).toContain('"anon", "authenticated"');
    });

    it('never creates or drops Supabase identity rows', async () => {
      const migration = new InitialSchema1730000000000();
      const { runner, queries } = recordingQueryRunner();

      await migration.up(runner);
      const sql = queries.join('\n');

      expect(sql).not.toMatch(/INSERT INTO\s+"?auth"?\./i);
      expect(sql).not.toMatch(/DELETE FROM\s+"?auth"?\./i);
      expect(sql).not.toMatch(/DROP TABLE\s+"?auth"?\./i);
    });
  });
});

describe('DataSource configuration', () => {
  const options = buildDataSourceOptions(validateEnv(testEnv())) as PostgresOptions;

  it('never synchronises the schema', () => {
    // Synchronising would silently drop or recreate tables in production.
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it('discovers every entity explicitly', () => {
    expect(ENTITIES).toHaveLength(3);
    expect(options.entities).toBe(ENTITIES);
  });

  it('uses a dedicated migrations table', () => {
    expect(options.migrationsTableName).toBe('moneytear_migrations');
  });

  it('disables TLS when DB_SSL is false', () => {
    expect(options.ssl).toBe(false);
  });

  it('enables TLS when DB_SSL is true', () => {
    const secure = buildDataSourceOptions(
      validateEnv(testEnv({ DB_SSL: 'true' })),
    ) as PostgresOptions;
    expect(secure.ssl).toEqual({ rejectUnauthorized: false });
  });
});