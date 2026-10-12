import { Throttle } from '@nestjs/throttler';
import { validateEnv, type Env } from '@/config/validation';

let cachedEnv: Env | null = null;

function throttleEnv(): Env {
  cachedEnv ??= validateEnv(process.env);
  return cachedEnv;
}

export function ThrottleSecuritySensitive(): MethodDecorator & ClassDecorator {
  return Throttle({
    default: {
      limit: () => throttleEnv().PIN_RATE_LIMIT_MAX,
      ttl: () => throttleEnv().RATE_LIMIT_TTL_MS,
    },
  });
}
