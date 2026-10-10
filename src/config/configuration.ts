import type { ConfigService } from '@nestjs/config';
import { type Env, validateEnv } from '@/config/validation';

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
  sslRejectUnauthorized: boolean;
  poolSize: number;
}

export interface SupabaseConfig {
  url: string;
  /** `${SUPABASE_URL}/auth/v1` - token issuer and JWKS base. */
  authBaseUrl: string;
  jwksUrl: string;
  audience: string;
  /** Legacy HS256 secret; `undefined` disables symmetric verification entirely. */
  legacyJwtSecret?: string;
}

export interface AuthConfig {
  recentAuthWindowSeconds: number;
  pin: {
    maxAttempts: number;
    lockSeconds: number;
    unlockTtlSeconds: number;
  };
}

export interface RateLimitConfig {
  ttlMs: number;
  max: number;
  pinMax: number;
}

export interface HttpConfig {
  corsOrigins: string[];
}

export interface ObservabilityConfig {
  appKey: string;
  appSecret: string;
}

export interface SwaggerConfig {
  enabled: boolean;
}

export interface AppConfiguration {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  database: DatabaseConfig;
  supabase: SupabaseConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  http: HttpConfig;
  observability: ObservabilityConfig;
  swagger: SwaggerConfig;
}

/** Strips a trailing slash so `${url}/auth/v1` never doubles up. */
function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Builds the typed, immutable configuration tree consumed through `ConfigService`.
 *
 * `validate` has already run in `ConfigModule.forRoot`, so values here are known
 * to be present and well-formed.
 */
export function buildConfiguration(env: Env): AppConfiguration {
  const authBaseUrl = `${trimTrailingSlash(env.SUPABASE_URL)}/auth/v1`;

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      ssl: env.DB_SSL,
      sslRejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
      poolSize: env.DB_POOL_SIZE,
    },
    supabase: {
      url: trimTrailingSlash(env.SUPABASE_URL),
      authBaseUrl,
      jwksUrl: `${authBaseUrl}/.well-known/jwks.json`,
      audience: env.AUTH_JWT_AUDIENCE,
      legacyJwtSecret: env.SUPABASE_JWT_SECRET,
    },
    auth: {
      recentAuthWindowSeconds: env.AUTH_RECENT_AUTH_WINDOW_SECONDS,
      pin: {
        maxAttempts: env.AUTH_PIN_MAX_ATTEMPTS,
        lockSeconds: env.AUTH_PIN_LOCK_SECONDS,
        unlockTtlSeconds: env.AUTH_PIN_UNLOCK_TTL_SECONDS,
      },
    },
    rateLimit: {
      ttlMs: env.RATE_LIMIT_TTL_MS,
      max: env.RATE_LIMIT_MAX,
      pinMax: env.PIN_RATE_LIMIT_MAX,
    },
    http: {
      corsOrigins: env.CORS_ORIGINS,
    },
    observability: {
      appKey: env.OBSERVE_APP_KEY,
      appSecret: env.OBSERVE_APP_SECRET,
    },
    swagger: {
      enabled: env.SWAGGER_ENABLED,
    },
  };
}

/** `ConfigModule.forRoot` entry point. */
export function loadConfiguration(): AppConfiguration {
  return buildConfiguration(validateEnv(process.env));
}

export const CONFIG_NAMESPACE = 'app';

/**
 * Single typed accessor for the application configuration.
 *
 * Every consumer goes through this helper so the namespace key and the fallback
 * behaviour are defined in exactly one place.
 */
export function getAppConfig(configService: ConfigService): AppConfiguration {
  return configService.getOrThrow<AppConfiguration>(CONFIG_NAMESPACE);
}