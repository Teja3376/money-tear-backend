import { z } from 'zod';
import { createZodDto } from '@/common/zod/create-zod-dto';
import { ACCOUNT_STATUSES } from '@/common/constants/account';

/**
 * Fields a client may read about itself.
 *
 * `role`, `status`, `id` and every column in `user_security` are deliberately
 * absent: they are server-owned and must never be client-writable.
 */
export const userResponseSchema = z.object({
  id: z.string().uuid().describe('Application user id (matches the Supabase Auth user id)'),
  phone: z.string().nullable().describe('Normalised phone number, when linked'),
  email: z.string().nullable().describe('Email address, when provided'),
  firstName: z.string().nullable().describe('Given name'),
  lastName: z.string().nullable().describe('Family name'),
  dateOfBirth: z
    .string()
    .nullable()
    .describe('Date of birth as YYYY-MM-DD (PostgreSQL DATE)'),
  role: z.string().describe('Application role'),
  status: z.enum(ACCOUNT_STATUSES as unknown as [string, ...string[]]).describe('Account status'),
  onboardingCompletedAt: z
    .string()
    .nullable()
    .describe('ISO timestamp at which onboarding finished'),
  createdAt: z.string().describe('ISO timestamp of creation'),
  updatedAt: z.string().describe('ISO timestamp of the last update'),
});

export type UserResponse = z.infer<typeof userResponseSchema>;

export class UserResponseDto extends createZodDto(userResponseSchema) {}

/**
 * Profile update payload.
 *
 * Unknown keys are stripped by the global zod pipe, so a client attempting
 * `{"role":"admin"}` or `{"status":"active"}` cannot reach the service layer even
 * if the endpoint is called directly.
 */
const nameField = z.string().trim().min(1).max(80);

export const updateProfileSchema = z
  .object({
    firstName: nameField.optional().describe('Given name (1-80 characters)'),
    lastName: nameField.optional().describe('Family name (1-80 characters)'),
    email: z.string().trim().email().max(254).optional().describe('Optional email address'),
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must use the YYYY-MM-DD format')
      .refine(isRealCalendarDate, 'dateOfBirth is not a valid calendar date')
      .optional()
      .describe('Date of birth as YYYY-MM-DD'),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}

/**
 * Instance type of the generated DTO class.
 *
 * Deriving the handler parameter type from the *class* (rather than from a plain
 * zod type alias) is what lets `@nestjs/swagger` read the class from
 * `design:paramtypes` and document the request body.
 */
export type UpdateProfileInput = InstanceType<typeof UpdateProfileDto>;

/**
 * Rejects syntactically well-formed but impossible dates such as `2025-02-30`,
 * which a regex alone would accept.
 */
function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day)
  ) {
    return false;
  }

  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

/** Profile fields required before the account counts as onboarded. */
export function isProfileComplete(user: {
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
}): boolean {
  return Boolean(user.firstName && user.lastName && user.dateOfBirth);
}