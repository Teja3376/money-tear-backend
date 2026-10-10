import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Per-user PIN material and brute-force counters.
 *
 * `pinHash` is write-only from the API's perspective: no DTO, response schema or
 * log statement ever exposes it. Keeping it in a separate table also means the
 * hot `users` row is never touched on a failed PIN attempt.
 */
@Entity({ name: 'user_security', schema: 'public' })
export class UserSecurity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Argon2id PHC string. `null` until a PIN is first configured. */
  @Column({ name: 'pin_hash', type: 'text', nullable: true })
  pinHash: string | null;

  @Column({ name: 'pin_set_at', type: 'timestamptz', nullable: true })
  pinSetAt: Date | null;

  @Column({ name: 'failed_pin_attempts', type: 'int', default: 0 })
  failedPinAttempts: number;

  /** Set when attempts are exhausted; cleared on successful verification. */
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}