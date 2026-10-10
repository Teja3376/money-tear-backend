import { Throttle } from '@nestjs/throttler';
import { validateEnv, type Env } from '@/config/validation';

/**
 * Cached environment for throttling limits.
 *
 * `ConfigModule` has already validated the environment by the time a request is
 * handled, and throttler limits are resolved per request, so the values are read
 * once and reused.
 */
let cachedEnv: Env | null = null;

function throttleEnv(): Env {
  cachedEnv ??= validateEnv(process.env);
  return cachedEnv;
}

/**
 * Applies the stricter per-IP limit to security-sensitive endpoints.
 *
 * The global limit exists to absorb ordinary traffic; PIN guessing is cheap per
 * request but expensive for the attacker, so these routes get their own tighter
 * budget (`PIN_RATE_LIMIT_MAX` per `RATE_LIMIT_TTL_MS`). This is the per-IP axis;
 * the per-user axis is the lockout counter in `SecurityService`.
 */
export function ThrottleSecuritySensitive(): MethodDecorator & ClassDecorator {
  return Throttle({
    default: {
      limit: () => throttleEnv().PIN_RATE_LIMIT_MAX,
      ttl: () => throttleEnv().RATE_LIMIT_TTL_MS,
    },
  });
}