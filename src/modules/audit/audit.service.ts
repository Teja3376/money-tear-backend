import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import type { AuditEventType } from '@/common/constants/audit-event';
import {
  AuthAuditEvent,
  type AuditMetadataValue,
} from '@/modules/audit/entities/auth-audit-event.entity';
import { resolveIpAddress, resolveUserAgent } from '@/common/utils/request-context';

/**
 * Keys that may never be persisted, regardless of caller intent.
 *
 * Defence in depth: the audit API only accepts these keys in the first place, and
 * any other key is dropped. This is what guarantees a PIN, OTP or token can never
 * reach `auth_audit_events` even if a future caller is careless.
 */
export const ALLOWED_METADATA_KEYS = [
  'reason',
  'source',
  'method',
  'attemptsRemaining',
  'lockedSeconds',
  'profileFields',
  'sessionId',
  'provider',
  'errorCode',
] as const;

export type AllowedMetadataKey = (typeof ALLOWED_METADATA_KEYS)[number];

export type AuditMetadata = Partial<Record<AllowedMetadataKey, AuditMetadataValue>>;

export interface AuditRecordInput {
  eventType: AuditEventType;
  success: boolean;
  userId?: string | null;
  /** HTTP request to source the IP / user agent from. */
  request?: Request;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: AuditMetadata;
}

/**
 * Writes security audit events.
 *
 * Audit persistence is best-effort by design: losing an audit row must never turn
 * a valid response into a 500. Failures are logged instead.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuthAuditEvent)
    private readonly auditRepository: Repository<AuthAuditEvent>,
  ) {}

  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.auditRepository.insert({
        eventType: input.eventType,
        success: input.success,
        userId: input.userId ?? null,
        ipAddress: input.ipAddress ?? (input.request ? resolveIpAddress(input.request) : null),
        userAgent: input.userAgent ?? (input.request ? resolveUserAgent(input.request) : null),
        metadata: sanitiseMetadata(input.metadata),
      });
    } catch (error) {
      this.logger.error(
        `Failed to persist audit event ${input.eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/** Drops every key outside the allow-list and strips unbounded strings. */
export function sanitiseMetadata(
  metadata: AuditMetadata | undefined,
): Record<string, AuditMetadataValue> {
  if (!metadata) {
    return {};
  }

  const safe: Record<string, AuditMetadataValue> = {};
  for (const key of ALLOWED_METADATA_KEYS) {
    const value = metadata[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value === 'string') {
      safe[key] = value.slice(0, 256);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safe[key] = value;
    }
  }
  return safe;
}