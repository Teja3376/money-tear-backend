import {
  ACCOUNT_STATUS,
  ACCOUNT_STATUSES,
  USER_ROLE,
  type AccountStatus,
  type UserRole,
} from '@/common/constants/account';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Application user. This is a *projection* of the Supabase Auth identity, never
 * a replacement for it: the row is keyed by `auth.users.id` and is created only
 * after a token has been cryptographically verified.
 *
 * The application never writes to `auth.users`.
 */
@Entity({ name: 'users', schema: 'public' })
export class User {
  /** Supabase Auth user id. Reused as the primary key - no second identity. */
  @PrimaryColumn('uuid')
  id: string;

  /** E.164-ish, stored without formatting. Null until the phone is linked. */
  @Index('idx_users_phone', { unique: true })
  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ name: 'first_name', type: 'text', nullable: true })
  firstName: string | null;

  @Column({ name: 'last_name', type: 'text', nullable: true })
  lastName: string | null;

  /** Stored as PostgreSQL `DATE` (no time component, no timezone). */
  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'text', default: USER_ROLE.USER })
  role: UserRole;

  @Index('idx_users_status')
  @Column({ type: 'text', default: ACCOUNT_STATUS.ACTIVE })
  status: AccountStatus;

  @Column({ name: 'onboarding_completed_at', type: 'timestamptz', nullable: true })
  onboardingCompletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** Soft-delete marker. Rows are never hard-deleted; the FK to `auth.users` cascades on identity removal. */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

/** Runtime guard for values read from the database. */
export function isKnownAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}