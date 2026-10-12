import type { AuditEventType } from '@/common/constants/audit-event';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AuditMetadataValue = string | number | boolean | null;

@Entity({ name: 'auth_audit_events', schema: 'public' })
export class AuthAuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_auth_audit_events_user_created')
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Index('idx_auth_audit_events_type_created')
  @Column({ name: 'event_type', type: 'text' })
  eventType: AuditEventType;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata: Record<string, AuditMetadataValue>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
