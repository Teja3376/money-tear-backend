import { describe, expect, it } from 'vitest';
import { updateProfileSchema, isProfileComplete, userResponseSchema } from '@/modules/users/dto/user.dto';
import { setupPinSchema, changePinSchema, verifyPinSchema, resetPinSchema } from '@/modules/security/dto/pin.dto';
import { normalisePhone } from '@/modules/users/users.service';

describe('PIN DTOs', () => {
  describe('setupPinSchema', () => {
    it('accepts a matching 4-digit pair', () => {
      expect(setupPinSchema.parse({ pin: '1234', confirmPin: '1234' })).toEqual({
        pin: '1234',
        confirmPin: '1234',
      });
    });

    it.each([
      ['too short', '123'],
      ['too long', '12345'],
      ['non-numeric', '12a4'],
      ['empty', ''],
      ['with a space', '12 4'],
      ['unicode digits', '１２３４'],
    ])('rejects a PIN that is %s', (_label, pin) => {
      expect(setupPinSchema.safeParse({ pin, confirmPin: pin }).success).toBe(false);
    });

    it('rejects a confirmation that does not match', () => {
      const result = setupPinSchema.safeParse({ pin: '1234', confirmPin: '5678' });

      expect(result.success).toBe(false);
    });

    it('rejects unknown fields instead of silently ignoring them', () => {
      const result = setupPinSchema.safeParse({
        pin: '1234',
        confirmPin: '1234',
        userId: '11111111-2222-4333-8444-555555555555',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('changePinSchema', () => {
    it('accepts a valid change', () => {
      expect(
        changePinSchema.parse({ currentPin: '1111', newPin: '2222', confirmNewPin: '2222' }),
      ).toBeTruthy();
    });

    it('rejects a mismatched confirmation', () => {
      expect(
        changePinSchema.safeParse({ currentPin: '1111', newPin: '2222', confirmNewPin: '3333' })
          .success,
      ).toBe(false);
    });
  });

  describe('verifyPinSchema', () => {
    it('rejects any payload with extra fields', () => {
      expect(verifyPinSchema.safeParse({ pin: '1234', extra: true }).success).toBe(false);
    });
  });

  describe('resetPinSchema', () => {
    it('accepts an empty body', () => {
      expect(resetPinSchema.safeParse({}).success).toBe(true);
    });

    it('rejects an attempt to prove identity by user id, phone or email', () => {
      // Reset authorisation comes from the token + recent-auth policy, never from
      // a supplied identifier.
      expect(
        resetPinSchema.safeParse({ userId: '11111111-2222-4333-8444-555555555555' }).success,
      ).toBe(false);
      expect(resetPinSchema.safeParse({ phone: '+919876543210' }).success).toBe(false);
      expect(resetPinSchema.safeParse({ email: 'a@b.com' }).success).toBe(false);
    });
  });
});

describe('updateProfileSchema', () => {
  it('accepts a partial update', () => {
    expect(updateProfileSchema.parse({ firstName: 'Ada' })).toEqual({ firstName: 'Ada' });
  });

  it('requires at least one field', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });

  it('rejects attempts to modify server-owned fields', () => {
    // Role, status and identifiers are not in the allow-list.
    expect(updateProfileSchema.safeParse({ role: 'admin' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ status: 'active' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ id: '11111111-2222-4333-8444-555555555555' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ pinHash: '$argon2id$fake' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ failedPinAttempts: 0 }).success).toBe(false);
  });

  it('validates the date of birth format and calendar validity', () => {
    expect(updateProfileSchema.safeParse({ dateOfBirth: '1990-05-21' }).success).toBe(true);
    // Syntactically fine, but not a real date.
    expect(updateProfileSchema.safeParse({ dateOfBirth: '2025-02-30' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ dateOfBirth: '21-05-1990' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ dateOfBirth: '1990-13-01' }).success).toBe(false);
  });

  it('rejects an invalid email', () => {
    expect(updateProfileSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ email: 'a@b.com' }).success).toBe(true);
  });

  it('rejects names that are empty or excessively long', () => {
    expect(updateProfileSchema.safeParse({ firstName: '   ' }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ firstName: 'x'.repeat(81) }).success).toBe(false);
  });
});

describe('userResponseSchema', () => {
  it('exposes no security fields', () => {
    const shape = Object.keys((userResponseSchema as unknown as { shape: object }).shape);

    expect(shape).not.toContain('pinHash');
    expect(shape).not.toContain('failedPinAttempts');
    expect(shape).not.toContain('lockedUntil');
    expect(shape).not.toContain('deletedAt');
  });
});

describe('normalisePhone', () => {
  it.each([
    ['+91 98765 43210', '+919876543210'],
    ['+91-98765-43210', '+919876543210'],
    ['(98765) 43210', '9876543210'],
    ['+919876543210', '+919876543210'],
  ])('normalises %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it('returns null for empty input', () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
    expect(normalisePhone('   ')).toBeNull();
  });
});

describe('isProfileComplete', () => {
  it('requires first name, last name and date of birth', () => {
    expect(isProfileComplete({ firstName: 'Ada', lastName: 'L', dateOfBirth: '1990-05-21' })).toBe(
      true,
    );
    expect(isProfileComplete({ firstName: 'Ada', lastName: null, dateOfBirth: '1990-05-21' })).toBe(
      false,
    );
    expect(isProfileComplete({ firstName: null, lastName: null, dateOfBirth: null })).toBe(false);
  });
});