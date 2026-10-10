import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

/** Request fields extracted for audit and throttling. */
export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const FORWARDED_FOR = 'x-forwarded-for';

/**
 * Best-effort client IP.
 *
 * `x-forwarded-for` is only honoured when the app sits behind a trusted proxy;
 * Express only populates `req.ip` from it when `trust proxy` is enabled (see
 * `main.ts`). A malformed or absent value yields `null` rather than a guess.
 */
export function resolveIpAddress(request: Request): string | null {
  const forwarded = request.headers[FORWARDED_FOR];
  const raw =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
        ? forwarded[0]?.split(',')[0]?.trim()
        : undefined;

  const candidate = raw || request.ip || request.socket?.remoteAddress || null;
  if (!candidate) {
    return null;
  }

  // Normalise IPv4-mapped IPv6 (`::ffff:1.2.3.4`) so it fits an `inet` column.
  return candidate.startsWith('::ffff:') ? candidate.slice(7) : candidate;
}

/** Truncated user agent; audit rows should not hold unbounded client input. */
export function resolveUserAgent(request: Request): string | null {
  const header = request.headers['user-agent'];
  if (typeof header !== 'string' || header.length === 0) {
    return null;
  }
  return header.slice(0, 512);
}

export function resolveRequestContext(request: Request): RequestContext {
  return {
    requestId: randomUUID(),
    ipAddress: resolveIpAddress(request),
    userAgent: resolveUserAgent(request),
  };
}