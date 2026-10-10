import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { ACCOUNT_STATUS } from '@/common/constants/account';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';
import type { User } from '@/modules/users/entities/user.entity';
import { UsersService, toUserResponse } from '@/modules/users/users.service';
import { OTHER_USER_ID, TEST_USER_ID } from '@test/test-env';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: TEST_USER_ID,
    phone: '+919876543210',
    email: null,
    firstName: null,
    lastName: null,
    dateOfBirth: null,
    role: 'user',
    status: ACCOUNT_STATUS.ACTIVE,
    onboardingCompletedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  } as User;
}

function identity(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: TEST_USER_ID,
    phone: '+919876543210',
    email: null,
    phoneVerified: true,
    provider: 'phone',
    sessionId: 'session-1',
    authTime: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

/** Repository double that records what was written. */
function buildRepository(seed: Partial<User> | null) {
  // Mock state is a plain record; `makeUser` re-establishes the entity shape.
  const state: { row: Partial<User> | null } = { row: seed ? { ...seed } : null };
  const written: Array<Record<string, unknown>> = [];

  const insertBuilder = {
    insert: () => insertBuilder,
    into: () => insertBuilder,
    values: (values: Partial<User>) => {
      insertBuilder.__values = values;
      return insertBuilder;
    },
    orIgnore: () => insertBuilder,
    returning: () => insertBuilder,
    execute: async () => {
      // `identifiers.length > 0` is how the service detects "row was created".
      const inserted = insertBuilder.__values as Partial<User>;
      const existed = state.row?.id === inserted?.id;
      if (!existed && inserted) {
        state.row = makeUser(inserted);
      }
      return { identifiers: existed ? [] : [inserted] };
    },
    __values: {} as Partial<User>,
  };

  const repository = {
    findOne: vi.fn(async (options?: { where?: { id?: string } }) => {
      if (options?.where?.id && state.row?.id !== options.where.id) {
        return null;
      }
      return state.row;
    }),
    createQueryBuilder: vi.fn(() => insertBuilder),
    update: vi.fn(async (_criteria: { id: string }, patch: Record<string, unknown>) => {
      written.push(patch);
      // `state.row` is a plain record; `makeUser` re-establishes the entity shape.
      const current = { ...state.row } as Partial<User>;
      state.row = makeUser({ ...current, ...patch });
      return { affected: 1 };
    }),
    __state: state,
    __written: written,
  };

  return repository as unknown as Repository<User> & {
    __state: typeof state;
    __written: Array<Record<string, unknown>>;
  };
}

describe('UsersService', () => {
  describe('bootstrap', () => {
    it('creates the user derived from the verified identity', async () => {
      const repository = buildRepository(null);
      const service = new UsersService(repository);

      const { user, created } = await service.bootstrap(identity());

      expect(created).toBe(true);
      expect(user.id).toBe(TEST_USER_ID);
      // The id comes from the token, and the phone is normalised.
      expect(user.phone).toBe('+919876543210');
    });

    it('is idempotent: a second call reports created=false and reuses the row', async () => {
      const repository = buildRepository(null);
      const service = new UsersService(repository);

      const first = await service.bootstrap(identity());
      const second = await service.bootstrap(identity());

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.user.id).toBe(first.user.id);
      expect(second.user.createdAt.getTime()).toBe(first.user.createdAt.getTime());
    });

    it('converges when two bootstraps race for the same user', async () => {
      // Simulates a unique-violation race: the row already exists by the time the
      // insert runs, so `orIgnore()` reports no inserted identifiers.
      const repository = buildRepository(makeUser());
      const service = new UsersService(repository);

      const result = await service.bootstrap(identity());

      expect(result.created).toBe(false);
      expect(result.user.id).toBe(TEST_USER_ID);
    });

    it('never inserts a user id taken from the request body', async () => {
      const repository = buildRepository(null);
      const service = new UsersService(repository);

      await service.bootstrap(identity({ userId: TEST_USER_ID }));

      expect(repository.__state.row?.id).toBe(TEST_USER_ID);
      expect(repository.__state.row?.id).not.toBe(OTHER_USER_ID);
    });
  });

  describe('updateProfile', () => {
    it('writes only the supplied allow-listed fields', async () => {
      const repository = buildRepository(makeUser());
      const service = new UsersService(repository);

      await service.updateProfile(TEST_USER_ID, { firstName: 'Ada', lastName: 'Lovelace' });

      expect(repository.__written[0]).toEqual({ firstName: 'Ada', lastName: 'Lovelace' });
    });

    it('never writes role, status or security columns', async () => {
      const repository = buildRepository(makeUser({ status: ACCOUNT_STATUS.ACTIVE }));
      const service = new UsersService(repository);

      await service.updateProfile(TEST_USER_ID, { firstName: 'Ada' });

      const patch = repository.__written[0] ?? {};
      expect(patch).not.toHaveProperty('role');
      expect(patch).not.toHaveProperty('status');
      expect(patch).not.toHaveProperty('id');
      expect(patch).not.toHaveProperty('pinHash');
      // Account status is preserved.
      expect(repository.__state.row?.status).toBe(ACCOUNT_STATUS.ACTIVE);
    });

    it('lowercases the email address', async () => {
      const repository = buildRepository(makeUser());
      const service = new UsersService(repository);

      await service.updateProfile(TEST_USER_ID, { email: 'Ada@Example.COM' });

      expect(repository.__written[0]).toMatchObject({ email: 'ada@example.com' });
    });

    it('stores the date of birth as a plain YYYY-MM-DD string for the DATE column', async () => {
      const repository = buildRepository(makeUser());
      const service = new UsersService(repository);

      await service.updateProfile(TEST_USER_ID, { dateOfBirth: '1990-05-21' });

      expect(repository.__written[0]).toMatchObject({ dateOfBirth: '1990-05-21' });
      expect(typeof (repository.__written[0] as { dateOfBirth: unknown }).dateOfBirth).toBe('string');
    });
  });

  describe('findStatus', () => {
    it('returns null when the user has not been bootstrapped yet', async () => {
      const service = new UsersService(buildRepository(null));

      expect(await service.findStatus(TEST_USER_ID)).toBeNull();
    });

    it('returns the persisted status', async () => {
      const service = new UsersService(buildRepository(makeUser({ status: ACCOUNT_STATUS.SUSPENDED })));

      expect(await service.findStatus(TEST_USER_ID)).toBe(ACCOUNT_STATUS.SUSPENDED);
    });
  });

  describe('toUserResponse', () => {
    it('omits internal fields such as deletedAt', () => {
      const response = toUserResponse(makeUser({ firstName: 'Ada' }));

      expect(response).not.toHaveProperty('deletedAt');
      expect(response.firstName).toBe('Ada');
      expect(response.createdAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });
});

describe('bootstrap consistency', () => {
  it('fails loudly if the row cannot be read back after insert', async () => {
    const repository = buildRepository(null);
    const service = new UsersService(repository);
    // Simulate the row disappearing between insert and select.
    vi.spyOn(repository, 'findOne').mockResolvedValue(null);

    // This is an internal inconsistency, so it surfaces as an unexpected server
    // error rather than being papered over with a success response.
    await expect(service.bootstrap(identity())).rejects.toThrow(
      /Failed to load application user/,
    );
  });
});