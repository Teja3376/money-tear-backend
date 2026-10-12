import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'user_security', schema: 'public' })
export class UserSecurity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'pin_hash', type: 'text', nullable: true })
  pinHash: string | null;

  @Column({ name: 'pin_set_at', type: 'timestamptz', nullable: true })
  pinSetAt: Date | null;

  @Column({ name: 'failed_pin_attempts', type: 'int', default: 0 })
  failedPinAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
