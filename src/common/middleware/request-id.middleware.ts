import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/** Adds the correlation id carried on `request.requestId`. */
export interface RequestWithId extends Request {
  requestId: string;
}

/** Header used for the correlation id, in both directions. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Maximum accepted length of a client-supplied id, to bound what we echo. */
const MAX_INBOUND_LENGTH = 128;

/**
 * Assigns a correlation id to every request.
 *
 * A client-supplied `X-Request-Id` is honoured (truncated) so a trace started at
 * the mobile client can be followed into the logs; otherwise a UUID is minted.
 * The id is echoed in the response header and read back by
 * `AllExceptionsFilter`, which puts it in both the error body and the log line.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const inbound = request.headers[REQUEST_ID_HEADER];
    const supplied =
      typeof inbound === 'string' ? inbound.trim().slice(0, MAX_INBOUND_LENGTH) : '';

    request.requestId = supplied.length > 0 ? supplied : randomUUID();
    response.setHeader(REQUEST_ID_HEADER, request.requestId);
    next();
  }
}