import { describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { AuditService, sanitiseMetadata } from '@/modules/audit/audit.service';
import type { AuthAuditEvent } from '@/modules/audit/entities/auth-audit-event.entity';
import { TEST_USER_ID } from '@test/test-env';

describe('sanitiseMetadata', () => {
  it('keeps allow-listed keys', () => {
    expect(
      sanitiseMetadata({ reason: 'already_configured', attemptsRemaining: 2, lockedSeconds: 60 }),
    ).toEqual({ reason: 'already_configured', attemptsRemaining: 2, lockedSeconds: 60 });
  });

  it('drops any key that is not allow-listed', () => {
    const sanitised = sanitiseMetadata({
      // A caller tries to smuggle sensitive values into the audit trail.
      pin: '1234',
      pinHash: '$argon2id$fake',
      token: 'eyJhbGciOi...',
      password: 'hunter2',
      otp: '999999',
      authorization: 'Bearer abc',
      dbPassword: 'secret',
      reason: 'ok',
    } as never);

    expect(sanitised).toEqual({ reason: 'ok' });
    expect(JSON.stringify(sanitised)).not.toContain('1234');
    expect(JSON.stringify(sanitised)).not.toContain('argon2');
  });

  it('truncates long strings so client input cannot bloat the table', () => {
    const sanitised = sanitiseMetadata({ reason: 'x'.repeat(1000) });

    expect(sanitised.reason).toHaveLength(256);
  });

  it('returns an empty object when metadata is absent', () => {
    expect(sanitiseMetadata(undefined)).toEqual({});
  });
});

describe('AuditService', () => {
  function buildRepository() {
    const inserted: Array<Partial<AuthAuditEvent>> = [];
    return {
      inserted,
      repository: {
        insert: vi.fn(async (values: Partial<AuthAuditEvent>) => {
          inserted.push(values);
        }),
      } as unknown as Repository<AuthAuditEvent>,
    };
  }

  it('records the event with a controlled type and outcome', async () => {
    const { repository, inserted } = buildRepository();
    const service = new AuditService(repository);

    await service.record({
      eventType: 'pin.verify.failed',
      success: false,
      userId: TEST_USER_ID,
      metadata: { reason: 'bad_pin' },
    });

    expect(inserted[0]).toMatchObject({
      eventType: 'pin.verify.failed',
      success: false,
      userId: TEST_USER_ID,
    });
  });

  it('records a null user id for pre-authentication events', async () => {
    const { repository, inserted } = buildRepository();
    const service = new AuditService(repository);

    await service.record({ eventType: 'token.rejected', success: false });

    expect(inserted[0]?.userId).toBeNull();
  });

  it('never writes secrets even when extra metadata is forced through', async () => {
    const { repository, inserted } = buildRepository();
    const service = new AuditService(repository);

    await service.record({
      eventType: 'pin.setup.failed',
      success: false,
      userId: TEST_USER_ID,
      metadata: { pin: '9999', reason: 'weak' } as never,
    });

    expect(JSON.stringify(inserted[0])).not.toContain('9999');
    expect(inserted[0]?.metadata).toEqual({ reason: 'weak' });
  });

  it('swallows persistence failures so auditing cannot break a request', async () => {
    const repository = {
      insert: vi.fn(async () => {
        throw new Error('database unavailable');
      }),
    } as unknown as Repository<AuthAuditEvent>;
    const service = new AuditService(repository);

    await expect(
      service.record({ eventType: 'logout.requested', success: true, userId: TEST_USER_ID }),
    ).resolves.toBeUndefined();
  });
});