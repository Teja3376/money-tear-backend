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
  request?: Request;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: AuditMetadata;
}

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
