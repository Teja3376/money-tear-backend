import { randomUUID } from 'node:crypto';
import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

export interface RequestWithId extends Request {
  requestId: string;
}

export const REQUEST_ID_HEADER = 'x-request-id';

const MAX_INBOUND_LENGTH = 128;

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();

    const inbound = request.headers[REQUEST_ID_HEADER];
    const supplied =
      typeof inbound === 'string' ? inbound.trim().slice(0, MAX_INBOUND_LENGTH) : '';

    request.requestId = supplied.length > 0 ? supplied : randomUUID();
    response.setHeader(REQUEST_ID_HEADER, request.requestId);

    return next.handle();
  }
}
