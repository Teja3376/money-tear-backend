import { z } from 'zod';
import { createZodDto } from '@/common/zod/create-zod-dto';
import { ACCOUNT_STATUSES } from '@/common/constants/account';

export const authUserSchema = z.object({
  id: z.string().uuid().describe('Application user id (matches the Supabase Auth user id)'),
  phone: z.string().nullable().describe('Normalised phone number from the verified token'),
  email: z.string().nullable().describe('Email from the verified token, when present'),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  dateOfBirth: z.string().nullable().describe('YYYY-MM-DD'),
  role: z.string().describe('Application role'),
  status: z.enum(ACCOUNT_STATUSES as unknown as [string, ...string[]]).describe(
    'active, suspended or disabled',
  ),
  onboardingCompletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const authStateSchema = z.object({
  user: authUserSchema.describe('The authenticated application user'),
  profileComplete: z
    .boolean()
    .describe('True when firstName, lastName and dateOfBirth are all set'),
  pinConfigured: z.boolean().describe('Whether an application PIN has been set'),
  accountStatus: z.enum(ACCOUNT_STATUSES as unknown as [string, ...string[]]).describe(
    'Current account status',
  ),
  created: z.boolean().optional().describe('Bootstrap only: true when a new row was created'),
});

export const logoutResultSchema = z.object({
  loggedOut: z.boolean().describe('The session was acknowledged and recorded'),
  scope: z
    .string()
    .describe(
      'Server-side effect of this call. Client-side token disposal is the client responsibility.',
    ),
});

export class AuthUserDto extends createZodDto(authUserSchema) {}
export class AuthStateDto extends createZodDto(authStateSchema) {}
export class LogoutResultDto extends createZodDto(logoutResultSchema) {}