import { Transform, plainToInstance } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

const booleanString = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    return value === 'true' || value === '1' || value === 'yes';
  });

const toInt = () => Transform(({ value }) => Number.parseInt(String(value), 10));

const optionalString = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

const toStringArray = () =>
  Transform(({ value }) => {
    if (typeof value !== 'string') return [];
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  });

export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @toInt()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  // --- Database -----------------------------------------------------------
  @IsString()
  @MinLength(1)
  DB_HOST!: string;

  @toInt()
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT: number = 5432;

  @IsString()
  @MinLength(1)
  DB_USERNAME!: string;

  @IsString()
  @MinLength(1)
  DB_PASSWORD!: string;

  @IsString()
  @MinLength(1)
  DB_NAME: string = 'postgres';

  @booleanString()
  @IsBoolean()
  DB_SSL: boolean = false;

  @toInt()
  @IsInt()
  @Min(1)
  @Max(100)
  DB_POOL_SIZE: number = 10;

  @booleanString()
  @IsBoolean()
  DB_SSL_REJECT_UNAUTHORIZED: boolean = false;

  // --- Supabase -----------------------------------------------------------
  @IsUrl({ require_tld: false, protocols: ['https'] })
  SUPABASE_URL!: string;

  @optionalString()
  @IsOptional()
  @IsString()
  @MinLength(1)
  SUPABASE_ANON_KEY?: string;

  @optionalString()
  @IsOptional()
  @IsString()
  @MinLength(1)
  SUPABASE_PUBLISHABLE_KEY?: string;

  @optionalString()
  @IsOptional()
  @IsString()
  @MinLength(1)
  SUPABASE_JWT_SECRET?: string;

  @IsString()
  @MinLength(1)
  AUTH_JWT_AUDIENCE: string = 'authenticated';

  // --- Auth / PIN policy --------------------------------------------------
  @toInt()
  @IsInt()
  @Min(30)
  @Max(3600)
  AUTH_RECENT_AUTH_WINDOW_SECONDS: number = 300;

  @toInt()
  @IsInt()
  @Min(1)
  @Max(20)
  AUTH_PIN_MAX_ATTEMPTS: number = 5;

  @toInt()
  @IsInt()
  @Min(30)
  @Max(86_400)
  AUTH_PIN_LOCK_SECONDS: number = 900;

  @toInt()
  @IsInt()
  @Min(30)
  @Max(3600)
  AUTH_PIN_UNLOCK_TTL_SECONDS: number = 300;

  // --- Rate limiting ------------------------------------------------------
  @toInt()
  @IsInt()
  @Min(1000)
  RATE_LIMIT_TTL_MS: number = 60_000;

  @toInt()
  @IsInt()
  @Min(1)
  RATE_LIMIT_MAX: number = 120;

  @toInt()
  @IsInt()
  @Min(1)
  PIN_RATE_LIMIT_MAX: number = 10;

  // --- HTTP ---------------------------------------------------------------
  @toStringArray()
  @IsArray()
  @IsString({ each: true })
  CORS_ORIGINS: string[] = [];

  // --- Documentation / observability -------------------------------------
  @booleanString()
  @IsBoolean()
  SWAGGER_ENABLED: boolean = true;

  @IsString()
  OBSERVE_APP_KEY: string = '';

  @IsString()
  OBSERVE_APP_SECRET: string = '';
}

export type Env = InstanceType<typeof EnvironmentVariables>;

export function validateEnv(raw: Record<string, unknown> = process.env): Env {
  const instance = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(instance, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('; ');
    throw new Error(`Invalid environment configuration -> ${details}`);
  }

  return instance;
}
