import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { SecurityController } from '@/modules/security/security.controller';
import { UsersController } from '@/modules/users/users.controller';
import { TEST_ENV, testConfiguration } from '@test/test-env';

type Resolvable<T> = T | ((...args: unknown[]) => T);

/** Reads the handler without referencing an unbound prototype method. */
function handlerOf(controller: object, methodName: string): object {
  return (controller as Record<string, unknown>)[methodName] as object;
}

function readLimit(methodName: string): Resolvable<number> | undefined {
  return Reflect.getMetadata(
    `${THROTTLER_LIMIT}default`,
    handlerOf(SecurityController.prototype, methodName),
  );
}

/**
 * The decorator stores its (resolvable) limit on the handler itself, so the
 * metadata can be asserted directly without issuing requests.
 */
describe('security-sensitive throttling', () => {
  it.each(['setup', 'verify', 'change', 'reset'])(
    'applies a stricter per-IP limit to PIN "%s"',
    (methodName) => {
      expect(readLimit(methodName), `${methodName} should be throttled`).toBeDefined();
    },
  );

  it('resolves the limit from the configured PIN budget', () => {
    // The decorator resolves its limits from the environment, exactly as it does
    // in production.
    const previous = { ...process.env };
    Object.assign(process.env, TEST_ENV);

    try {
      const config = testConfiguration();
      const limit = readLimit('verify');

      expect(typeof limit).toBe('function');
      const resolved = (limit as (...args: unknown[]) => number)();
      expect(resolved).toBe(config.rateLimit.pinMax);
    } finally {
      process.env = previous;
    }
  });

  it('keeps the PIN budget tighter than the global default', () => {
    const config = testConfiguration();

    expect(config.rateLimit.pinMax).toBeLessThan(config.rateLimit.max);
  });

  it('leaves the read-only profile routes on the global limit', () => {
    // GET /users/me is not a guessing surface and should not be throttled harder.
    const limit = Reflect.getMetadata(
      `${THROTTLER_LIMIT}default`,
      handlerOf(UsersController.prototype, 'getMe'),
    );

    expect(limit).toBeUndefined();
  });
});