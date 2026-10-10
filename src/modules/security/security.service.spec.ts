import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { CONFIG_NAMESPACE, buildConfiguration } from '@/config/configuration';
import { validateEnv } from '@/config/validation';
import { PinLockedException } from '@/common/errors/pin-locked.exception';
import type { AuditService } from '@/modules/audit/audit.service';
import type { UserSecurity } from '@/modules/security/entities/user-security.entity';
import { PinHasher } from '@/modules/security/pin-hasher.service';
import { PinUnlockService } from '@/modules/security/pin-unlock.service';
import { SecurityService } from '@/modules/security/security.service';
import { TEST_USER_ID, testEnv } from '@test/test-env';

type SecurityRow = Partial<UserSecurity>;

/**
 * In-memory stand-in for the `user_security` repository.
 *
 * It mirrors the two behaviours the service depends on: partial updates that
 * merge, and a counter increment performed as an atomic database expression.
 */
function buildRepository(initial: SecurityRow | null) {
  // Plain record, not an entity instance: spreading a class instance would drop
  // its prototype, and the service only ever reads fields from this state.
  const state: { row: SecurityRow | null } = { row: initial ? { ...initial } : null };

  const repository = {
    findOne: vi.fn(async () => (state.row ? ({ ...state.row } as UserSecurity) : null)),

    insert: vi.fn(async (values: SecurityRow) => {
      state.row = {
        userId: TEST_USER_ID,
        pinHash: null,
        failedPinAttempts: 0,
        lockedUntil: null,
        ...values,
      };
    }),

    update: vi.fn(async (_criteria: unknown, patch: SecurityRow) => {
      state.row = { ...(state.row ?? { userId: TEST_USER_ID }), ...patch };
      return { affected: 1 };
    }),

    createQueryBuilder: vi.fn(() => {
      const builder = {
        update: vi.fn(() => builder),
        set: vi.fn((values: Record<string, unknown>) => {
          // The service passes a SQL expression for the atomic increment.
          if (typeof values['failedPinAttempts'] === 'function' && state.row) {
            state.row = {
              ...state.row,
              failedPinAttempts: (state.row.failedPinAttempts ?? 0) + 1,
            };
          }
          return builder;
        }),
        where: vi.fn(() => builder),
        returning: vi.fn(() => builder),
        execute: vi.fn(async () => ({
          raw: [{ failed_pin_attempts: state.row?.failedPinAttempts ?? 0 }],
        })),
      };
      return builder;
    }),

    __state: state,
  };

  return repository as unknown as Repository<UserSecurity> & { __state: typeof state };
}

interface Harness {
  service: SecurityService;
  unlockService: PinUnlockService;
  auditService: { record: ReturnType<typeof vi.fn> };
  repository: ReturnType<typeof buildRepository>;
}

/** Builds a service bound to a fresh repository and unlock store. */
function buildHarness(initial: SecurityRow | null = null): Harness {
  const repository = buildRepository(initial);
  const env = validateEnv(testEnv());
  const configService = new ConfigService({ [CONFIG_NAMESPACE]: buildConfiguration(env) });

  const auditService = { record: vi.fn(async () => undefined) };
  const unlockService = new PinUnlockService();
  const service = new SecurityService(
    repository,
    new PinHasher(),
    unlockService,
    auditService as unknown as AuditService,
    configService,
  );

  return { service, unlockService, auditService, repository };
}

const SETUP = { pin: '1234', confirmPin: '1234' };

describe('SecurityService', () => {
  describe('setupPin', () => {
    it('stores an Argon2id hash and never the plaintext PIN', async () => {
      const { service, repository } = buildHarness();

      const result = await service.setupPin(TEST_USER_ID, SETUP);

      expect(result).toEqual({ success: true, configured: true });
      const stored = await repository.findOne({ where: { userId: TEST_USER_ID } });
      expect(stored?.pinHash).toMatch(/^\$argon2id\$/);
      expect(JSON.stringify(stored)).not.toContain('1234');
    });

    it('refuses to overwrite an existing PIN', async () => {
      const { service, auditService } = buildHarness({
        userId: TEST_USER_ID,
        pinHash: '$argon2id$v=19$m=1,t=1,p=1$existing',
      });

      await expect(service.setupPin(TEST_USER_ID, SETUP)).rejects.toThrow(ConflictException);

      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'pin.setup.rejected', success: false }),
      );
    });

    it('revokes any PIN-unlock state when a PIN is set', async () => {
      const { service, unlockService } = buildHarness();
      unlockService.unlock(TEST_USER_ID, 120);
      expect(unlockService.isUnlocked(TEST_USER_ID)).toBe(true);

      await service.setupPin(TEST_USER_ID, SETUP);

      expect(unlockService.isUnlocked(TEST_USER_ID)).toBe(false);
    });
  });

  describe('verifyPin', () => {
    let harness: Harness;

    beforeEach(async () => {
      harness = buildHarness();
      await harness.service.setupPin(TEST_USER_ID, SETUP);
    });

    it('verifies the correct PIN and opens a server-side unlock state', async () => {
      const outcome = await harness.service.verifyPin(TEST_USER_ID, '1234');

      expect(outcome.verified).toBe(true);
      expect(outcome.unlockedUntil).toBeInstanceOf(Date);
      // The unlock lives on the server, not in the response alone.
      expect(harness.unlockService.isUnlocked(TEST_USER_ID)).toBe(true);
      expect(harness.unlockService.getExpiry(TEST_USER_ID)).toBeInstanceOf(Date);
    });

    it('throws a generic error for a wrong PIN', async () => {
      await expect(harness.service.verifyPin(TEST_USER_ID, '9999')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(harness.service.verifyPin(TEST_USER_ID, '9999')).rejects.toThrow('Invalid PIN');
    });

    it('counts failed attempts and locks the PIN at the threshold', async () => {
      // AUTH_PIN_MAX_ATTEMPTS is 3 in the test environment.
      await expect(harness.service.verifyPin(TEST_USER_ID, '0000')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(harness.service.verifyPin(TEST_USER_ID, '0001')).rejects.toThrow(
        UnauthorizedException,
      );
      // Third failure trips the lockout.
      await expect(harness.service.verifyPin(TEST_USER_ID, '0002')).rejects.toThrow(
        PinLockedException,
      );

      // Even the correct PIN is refused while locked.
      await expect(harness.service.verifyPin(TEST_USER_ID, '1234')).rejects.toThrow(
        PinLockedException,
      );
    });

    it('reports the lockout without revealing the PIN or the reason', async () => {
      let message = '';
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          await harness.service.verifyPin(TEST_USER_ID, '0000');
        } catch (error) {
          message = (error as Error).message;
        }
      }

      expect(message).toBe('Too many incorrect PIN attempts. Try again later.');
    });

    it('exposes a positive Retry-After hint while locked', async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await harness.service.verifyPin(TEST_USER_ID, '0000').catch(() => undefined);
      }

      try {
        await harness.service.verifyPin(TEST_USER_ID, '1234');
        expect.unreachable('verification should have been refused');
      } catch (error) {
        expect(error).toBeInstanceOf(PinLockedException);
        expect((error as PinLockedException).retryAfterSeconds).toBeGreaterThan(0);
      }
    });

    it('resets the failure counter after a successful verification', async () => {
      // One deliberate failure to increment the counter.
      await expect(harness.service.verifyPin(TEST_USER_ID, '0000')).rejects.toThrow(
        UnauthorizedException,
      );

      await expect(harness.service.verifyPin(TEST_USER_ID, '1234')).resolves.toMatchObject({
        verified: true,
      });

      const stored = await harness.repository.findOne({ where: { userId: TEST_USER_ID } });
      expect(stored?.failedPinAttempts).toBe(0);
    });

    it('refuses verification when no PIN is configured', async () => {
      const fresh = buildHarness();

      await expect(fresh.service.verifyPin(TEST_USER_ID, '1234')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('changePin', () => {
    let harness: Harness;

    beforeEach(async () => {
      harness = buildHarness();
      await harness.service.setupPin(TEST_USER_ID, SETUP);
    });

    it('changes the PIN after proving the current one', async () => {
      await harness.service.changePin(TEST_USER_ID, {
        currentPin: '1234',
        newPin: '5678',
        confirmNewPin: '5678',
      });

      await expect(harness.service.verifyPin(TEST_USER_ID, '5678')).resolves.toMatchObject({
        verified: true,
      });
      await expect(harness.service.verifyPin(TEST_USER_ID, '1234')).rejects.toThrow(
        'Invalid PIN',
      );
    });

    it('rejects a wrong current PIN without changing anything', async () => {
      await expect(
        harness.service.changePin(TEST_USER_ID, {
          currentPin: '0000',
          newPin: '5678',
          confirmNewPin: '5678',
        }),
      ).rejects.toThrow('Invalid PIN');

      // The original PIN must still work.
      await expect(harness.service.verifyPin(TEST_USER_ID, '1234')).resolves.toMatchObject({
        verified: true,
      });
    });

    it('rejects a new PIN identical to the current one', async () => {
      await expect(
        harness.service.changePin(TEST_USER_ID, {
          currentPin: '1234',
          newPin: '1234',
          confirmNewPin: '1234',
        }),
      ).rejects.toThrow(/must differ/i);
    });

    it('revokes the unlock state after a change', async () => {
      await harness.service.verifyPin(TEST_USER_ID, '1234');
      expect(harness.unlockService.isUnlocked(TEST_USER_ID)).toBe(true);

      await harness.service.changePin(TEST_USER_ID, {
        currentPin: '1234',
        newPin: '5678',
        confirmNewPin: '5678',
      });

      expect(harness.unlockService.isUnlocked(TEST_USER_ID)).toBe(false);
    });

    it('records an audit event for a successful change', async () => {
      await harness.service.changePin(TEST_USER_ID, {
        currentPin: '1234',
        newPin: '5678',
        confirmNewPin: '5678',
      });

      expect(harness.auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'pin.change.succeeded', success: true }),
      );
    });
  });

  describe('resetPin', () => {
    it('clears the PIN so verification is impossible again', async () => {
      const harness = buildHarness();
      await harness.service.setupPin(TEST_USER_ID, SETUP);

      const result = await harness.service.resetPin(TEST_USER_ID);

      expect(result).toEqual({ success: true, configured: false });
      await expect(harness.service.verifyPin(TEST_USER_ID, '1234')).rejects.toThrow(
        ConflictException,
      );
    });

    it('invalidates the PIN-unlock state', async () => {
      const harness = buildHarness();
      await harness.service.setupPin(TEST_USER_ID, SETUP);
      await harness.service.verifyPin(TEST_USER_ID, '1234');
      expect(harness.unlockService.isUnlocked(TEST_USER_ID)).toBe(true);

      await harness.service.resetPin(TEST_USER_ID);

      expect(harness.unlockService.isUnlocked(TEST_USER_ID)).toBe(false);
    });

    it('records an audit event', async () => {
      const harness = buildHarness();

      await harness.service.resetPin(TEST_USER_ID);

      expect(harness.auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'pin.reset.succeeded', success: true }),
      );
    });
  });

  describe('getStatus', () => {
    it('reports only whether a PIN is configured', async () => {
      const harness = buildHarness();

      expect(await harness.service.getStatus(TEST_USER_ID)).toMatchObject({ configured: false });

      await harness.service.setupPin(TEST_USER_ID, SETUP);

      const status = await harness.service.getStatus(TEST_USER_ID);
      expect(status.configured).toBe(true);
      // Never leaks the hash or the brute-force counters.
      expect(JSON.stringify(status)).not.toContain('argon2');
      expect(JSON.stringify(status)).not.toContain('failedPinAttempts');
    });
  });
});