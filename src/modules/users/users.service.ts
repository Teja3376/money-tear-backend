import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ACCOUNT_STATUS, type AccountStatus } from '@/common/constants/account';
import { User } from '@/modules/users/entities/user.entity';
import type { UpdateProfileInput, UserResponse } from '@/modules/users/dto/user.dto';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';

/** `+91 98765 43210`, `987-654-3210` and `+919876543210` all normalise alike. */
export function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) {
    return null;
  }
  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 0) {
    return null;
  }
  return hasPlus ? `+${digits}` : digits;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  findById(userId: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id: userId } });
  }

  /**
   * Creates the application user for a verified identity, or returns the existing row.
   *
   * Idempotent and safe under concurrency:
   *  - `INSERT ... ON CONFLICT (id) DO NOTHING` means two simultaneous bootstrap
   *    calls cannot raise a duplicate-key error;
   *  - the subsequent `SELECT` reads the row that won the race, so both callers
   *    observe identical state.
   *
   * The id comes from the verified token, never from the request body.
   */
  async bootstrap(identity: AuthenticatedUser): Promise<{ user: User; created: boolean }> {
    const insertResult = await this.usersRepository
      .createQueryBuilder()
      .insert()
      .into(User)
      .values({
        id: identity.userId,
        phone: normalisePhone(identity.phone),
        email: identity.email,
        role: 'user',
        status: ACCOUNT_STATUS.ACTIVE,
      })
      .orIgnore()
      .returning('id')
      .execute();

    const created = insertResult.identifiers.length > 0;
    if (created) {
      this.logger.log(`Bootstrapped application user ${identity.userId}`);
    }

    const user = await this.usersRepository.findOne({ where: { id: identity.userId } });
    if (!user) {
      // Only reachable if the row vanished between insert and select.
      throw new Error(`Failed to load application user ${identity.userId}`);
    }

    return { user, created };
  }

  /**
   * Applies an allowlisted profile update.
   *
   * Only the keys present on the DTO are written; `role`, `status`, `id` and
   * security columns are not part of the update object and therefore cannot be
   * modified here.
   */
  async updateProfile(
    userId: string,
    input: UpdateProfileInput,
  ): Promise<UserResponse> {
    const patch: Partial<User> = {};

    if (input.firstName !== undefined) patch.firstName = input.firstName;
    if (input.lastName !== undefined) patch.lastName = input.lastName;
    if (input.email !== undefined) patch.email = input.email.toLowerCase();
    if (input.dateOfBirth !== undefined) patch.dateOfBirth = input.dateOfBirth;

    await this.usersRepository.update({ id: userId }, patch);

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error(`Application user ${userId} disappeared during profile update`);
    }

    return toUserResponse(user);
  }

    /**
   * Account status for the authorisation guard.
   *
   * Returns `null` when no application row exists yet - a caller who has not
   * bootstrapped is not "suspended", and bootstrap must remain reachable.
   */
  async findStatus(userId: string): Promise<AccountStatus | null> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { status: true },
    });
    return user?.status ?? null;
  }
}

/** Maps an entity to its public projection. `deletedAt` is intentionally not exposed. */
export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    phone: user.phone ?? null,
    email: user.email ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    role: user.role,
    status: user.status,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}