import { buildConfiguration } from '@/config/configuration';
import { validateEnv } from '@/config/validation';

/**
 * Baseline environment for tests.
 *
 * Values are deliberately fake and non-routable; nothing here can reach a real
 * Supabase project, a real database or an SMS provider. The Supabase URL points
 * at `.invalid` (RFC 2606) so an accidental network call fails fast instead of
 * hitting a live project.
 */
export const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',

  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USERNAME: 'test_user',
  DB_PASSWORD: 'test_password',
  DB_NAME: 'test_db',
  DB_SSL: 'false',

  SUPABASE_URL: 'https://test-project.supabase.invalid',
  SUPABASE_ANON_KEY: 'test-anon-key-placeholder',
  AUTH_JWT_AUDIENCE: 'authenticated',

  AUTH_RECENT_AUTH_WINDOW_SECONDS: '300',
  AUTH_PIN_MAX_ATTEMPTS: '3',
  AUTH_PIN_LOCK_SECONDS: '60',
  AUTH_PIN_UNLOCK_TTL_SECONDS: '120',

  RATE_LIMIT_TTL_MS: '60000',
  RATE_LIMIT_MAX: '100',
  PIN_RATE_LIMIT_MAX: '5',

  CORS_ORIGINS: 'http://localhost:8081',
  SWAGGER_ENABLED: 'true',
} as const;

/** Fully validated configuration for unit tests. */
export function testConfiguration() {
  return buildConfiguration(validateEnv({ ...TEST_ENV }));
}

/** Valid environment object, for tests that assert env validation itself. */
export function testEnv(overrides: Record<string, string | undefined> = {}) {
  return { ...TEST_ENV, ...overrides };
}

/** A syntactically valid UUID that is not a real user. */
export const TEST_USER_ID = '11111111-2222-4333-8444-555555555555';

/** A second synthetic user id, used to prove cross-user isolation. */
export const OTHER_USER_ID = '99999999-8888-4777-8666-555555555555';