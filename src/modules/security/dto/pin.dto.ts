import { z } from 'zod';
import { createZodDto } from '@/common/zod/create-zod-dto';

/**
 * Exactly four ASCII digits.
 *
 * The pattern is anchored and digit-only, so Unicode digit look-alikes and
 * whitespace are rejected. It intentionally allows weak sequences (`0000`,
 * `1234`); this is a local device-style PIN, and the real defence against guessing
 * is Argon2id hashing plus lockout and throttling.
 */
export const pinSchema = z
  .string()
  .regex(/^[0-9]{4}$/, 'pin must be exactly 4 digits');

export const setupPinSchema = z
  .object({
    pin: pinSchema.describe('The 4-digit PIN to set'),
    confirmPin: pinSchema.describe('Must match "pin"'),
  })
  .strict()
  .refine((value) => value.pin === value.confirmPin, {
    message: 'confirmPin must match pin',
    path: ['confirmPin'],
  });

export const changePinSchema = z
  .object({
    currentPin: pinSchema.describe('The PIN currently configured'),
    newPin: pinSchema.describe('The replacement PIN'),
    confirmNewPin: pinSchema.describe('Must match "newPin"'),
  })
  .strict()
  .refine((value) => value.newPin === value.confirmNewPin, {
    message: 'confirmNewPin must match newPin',
    path: ['confirmNewPin'],
  });

export const verifyPinSchema = z
  .object({
    pin: pinSchema.describe('The PIN to verify'),
  })
  .strict();

/**
 * PIN reset requires *renewed identity verification*.
 *
 * The endpoint never accepts a user id, phone number or email: the caller must
 * present a valid access token that additionally satisfies `RecentAuthGuard`,
 * i.e. a sign-in performed within the configured window.
 */
export const resetPinSchema = z.object({}).strict();

export class SetupPinDto extends createZodDto(setupPinSchema) {}
export class ChangePinDto extends createZodDto(changePinSchema) {}
export class VerifyPinDto extends createZodDto(verifyPinSchema) {}
export class ResetPinDto extends createZodDto(resetPinSchema) {}

export type SetupPinInput = InstanceType<typeof SetupPinDto>;
export type ChangePinInput = InstanceType<typeof ChangePinDto>;
export type VerifyPinInput = InstanceType<typeof VerifyPinDto>;

export const pinStatusSchema = z.object({
  configured: z.boolean().describe('Whether a PIN has been set for this account'),
  updatedAt: z
    .string()
    .nullable()
    .describe('ISO timestamp of the last PIN change (no lockout counters are exposed)'),
});

export class PinStatusDto extends createZodDto(pinStatusSchema) {}

export const pinVerifiedSchema = z.object({
  verified: z.boolean().describe('True only when the supplied PIN matched'),
  unlockedUntil: z
    .string()
    .nullable()
    .describe(
      'Server-side PIN-unlock expiry. This reflects state held by the API, not a client-side flag.',
    ),
});

export class PinVerifiedDto extends createZodDto(pinVerifiedSchema) {}

export const pinMutationResultSchema = z.object({
  success: z.boolean().describe('Whether the operation completed'),
  configured: z.boolean().describe('Whether a PIN is configured after the operation'),
});

export class PinMutationResultDto extends createZodDto(pinMutationResultSchema) {}