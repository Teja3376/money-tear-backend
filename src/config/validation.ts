import { z } from 'zod';

/** Accepts `"true"/"false"/"1"/"0"/"yes"/"no"` and coerces to a boolean. */
const booleanFromEnv = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((value) => value === 'true' || value === '1' || value === 'yes');

const optionalString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value) => (value === '' ? undefined : value));

/**
 * Environment contract. Parsed once at boot; a violation aborts startup rather
 * than surfacing later as a confusing runtime failure.
 *
 * Secrets are only ever *validated* here. Nothing in this file logs or returns
 * their values.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // --- Database -----------------------------------------------------------
  DB_HOST: z.string().trim().min(1, 'DB_HOST is required'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  DB_USERNAME: z.string().trim().min(1, 'DB_USERNAME is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_NAME: z.string().trim().min(1).default('postgres'),
  DB_SSL: booleanFromEnv.default(false),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  DB_SSL_REJECT_UNAUTHORIZED: booleanFromEnv.default(false),

  // --- Supabase -----------------------------------------------------------
  SUPABASE_URL: z
    .string()
    .trim()
    .url('SUPABASE_URL must be a valid URL (e.g. https://<project-ref>.supabase.co)'),
  /**
   * Publishable/anon key. The backend never calls Supabase with it - tokens are
   * verified locally against JWKS - but it is validated so misconfiguration is
   * caught early, and so the mobile client can be given a single source of truth.
   */
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_PUBLISHABLE_KEY: optionalString,
  /**
   * Legacy HS256 signing secret. Optional: only needed for projects still using
   * symmetric signing. Never logged.
   */
  SUPABASE_JWT_SECRET: optionalString,
  AUTH_JWT_AUDIENCE: z.string().trim().min(1).default('authenticated'),

  // --- Auth / PIN policy --------------------------------------------------
  AUTH_RECENT_AUTH_WINDOW_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  AUTH_PIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  AUTH_PIN_LOCK_SECONDS: z.coerce.number().int().min(30).max(86_400).default(900),
  AUTH_PIN_UNLOCK_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),

  // --- Rate limiting ------------------------------------------------------
  RATE_LIMIT_TTL_MS: z.coerce.number().int().min(1000).default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  PIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),

  // --- HTTP ---------------------------------------------------------------
  CORS_ORIGINS: z
    .string()
    .trim()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // --- Documentation / observability -------------------------------------
  SWAGGER_ENABLED: booleanFromEnv.default(true),
  OBSERVE_APP_KEY: z.string().trim().default(''),
  OBSERVE_APP_SECRET: z.string().trim().default(''),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates `process.env`. Throws a single aggregated, secret-free error listing
 * only the offending variable names.
 */
export function validateEnv(raw: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${details}`);
  }

  return result.data;
}