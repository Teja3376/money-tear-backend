import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { CONFIG_NAMESPACE, buildConfiguration } from '@/config/configuration';
import { validateEnv } from '@/config/validation';
import { PinUnlockService } from '@/modules/security/pin-unlock.service';
import { RecentAuthGuard } from '@/common/guards/recent-auth.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';
import { TEST_USER_ID, testEnv } from '@test/test-env';

function configService(): ConfigService {
  const env = validateEnv(testEnv());
  return new ConfigService({ [CONFIG_NAMESPACE]: buildConfiguration(env) });
}

/** Minimal ExecutionContext double carrying a user and public-route metadata. */
function executionContext(options: {
  user?: AuthenticatedUser;
  isPublic?: boolean;
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: options.user, headers: {} }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    // The guard reads public-route metadata through the Reflector, which we stub.
    getHandlerAndClass: () => [],
  } as unknown as ExecutionContext;
}

describe('RecentAuthGuard', () => {
  let guard: RecentAuthGuard;

  beforeEach(() => {
    guard = new RecentAuthGuard(configService());
  });

  const userWithAuthTime = (authTime: number | null): AuthenticatedUser => ({
    userId: TEST_USER_ID,
    phone: '+919876543210',
    email: null,
    phoneVerified: true,
    provider: 'phone',
    sessionId: 'session-1',
    authTime,
  });

  it('allows a recently authenticated caller', () => {
    const now = Math.floor(Date.now() / 1000);

    expect(guard.canActivate(executionContext({ user: userWithAuthTime(now - 10) }))).toBe(true);
  });

  it('denies a caller who authenticated too long ago', () => {
    // The window is 300s in the test environment.
    const stale = Math.floor(Date.now() / 1000) - 3600;

    expect(() => guard.canActivate(executionContext({ user: userWithAuthTime(stale) }))).toThrow(
      ForbiddenException,
    );
  });

  it('denies a caller with no auth_time claim', () => {
    expect(() => guard.canActivate(executionContext({ user: userWithAuthTime(null) }))).toThrow(
      ForbiddenException,
    );
  });

  it('denies an unauthenticated caller rather than crashing', () => {
    expect(() => guard.canActivate(executionContext({}))).toThrow(UnauthorizedException);
  });
});

describe('JwtAuthGuard', () => {
  function buildGuard(verify: () => Promise<AuthenticatedUser>, isPublic = false): JwtAuthGuard {
    const verifier = { verifyAuthorizationHeader: verify } as never;
    const reflector = {
      getAllAndOverride: vi.fn(() => isPublic),
    } as unknown as Reflector;
    return new JwtAuthGuard(verifier, reflector);
  }

  it('skips verification for routes marked @Public()', async () => {
    const verify = vi.fn(async () => {
      throw new Error('should not be called');
    });
    const guard = buildGuard(verify, true);

    await expect(guard.canActivate(executionContext({}))).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('verifies the token and attaches a typed identity for protected routes', async () => {
    const identity: AuthenticatedUser = {
      userId: TEST_USER_ID,
      phone: null,
      email: null,
      phoneVerified: false,
      provider: 'phone',
      sessionId: null,
      authTime: 1,
    };
    const guard = buildGuard(async () => identity);
    const request: { user?: AuthenticatedUser } = {};
    const context = {
      switchToHttp: () => ({ getRequest: () => Object.assign(request, { headers: {} }) }),
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(identity);
  });

  it('propagates a rejection when the token is invalid', async () => {
    const guard = buildGuard(async () => {
      throw new UnauthorizedException('Invalid or expired access token');
    });

    await expect(guard.canActivate(executionContext({}))).rejects.toThrow(UnauthorizedException);
  });
});

describe('PinUnlockService', () => {
  let service: PinUnlockService;

  beforeEach(() => {
    service = new PinUnlockService();
  });

  it('starts with no user unlocked', () => {
    expect(service.isUnlocked(TEST_USER_ID)).toBe(false);
    expect(service.getExpiry(TEST_USER_ID)).toBeNull();
  });

  it('records an unlock with an expiry', () => {
    const expiry = service.unlock(TEST_USER_ID, 300);

    expect(expiry).toBeInstanceOf(Date);
    expect(service.isUnlocked(TEST_USER_ID)).toBe(true);
  });

  it('expires the unlock once the TTL elapses', () => {
    vi.spyOn(service as unknown as { now: () => number }, 'now').mockReturnValue(1_000_000);
    service.unlock(TEST_USER_ID, 300);

    vi.spyOn(service as unknown as { now: () => number }, 'now').mockReturnValue(1_000_000 + 301_000);

    expect(service.isUnlocked(TEST_USER_ID)).toBe(false);
    expect(service.getExpiry(TEST_USER_ID)).toBeNull();
  });

  it('revokes the unlock state', () => {
    service.unlock(TEST_USER_ID, 300);
    service.lock(TEST_USER_ID);

    expect(service.isUnlocked(TEST_USER_ID)).toBe(false);
  });

  it('keeps unlock state per user, not global', () => {
    service.unlock(TEST_USER_ID, 300);

    expect(service.isUnlocked('99999999-8888-4777-8666-555555555555')).toBe(false);
  });

  it('treats a non-positive TTL as an immediate lock', () => {
    expect(service.unlock(TEST_USER_ID, 0)).toBeNull();
    expect(service.isUnlocked(TEST_USER_ID)).toBe(false);
  });
});