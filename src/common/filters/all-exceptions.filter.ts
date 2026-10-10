import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError } from '@/common/dto/api-error.dto';
import { PinLockedException } from '@/common/errors/pin-locked.exception';
import type { RequestWithId } from '@/common/middleware/request-id.middleware';
import { ZodValidationIssue } from '@/common/pipes/zod-validation.pipe';

/** Maps exception classes onto stable machine-readable codes. */
const ERROR_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'too_many_requests',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
};

/**
 * Normalises every thrown error into one JSON envelope.
 *
 * Guarantees:
 * - no stack traces and no raw driver/framework messages reach the client;
 * - the server log keeps the full error for diagnosis;
 * - the response always carries a `requestId` that correlates the two.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & Partial<RequestWithId>>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const validation = this.extractValidationIssues(body);

    // `PinLockedException` and the throttler both signal a retry delay; surface
    // it so a well-behaved client backs off instead of hammering the endpoint.
    const retryAfter = this.resolveRetryAfter(exception);
    if (retryAfter !== null) {
      response.setHeader('Retry-After', String(retryAfter));
    }

    const message = this.resolveClientMessage(exception, body, status);

    const errorPayload: ApiError = {
      statusCode: status,
      error: ERROR_CODES[status] ?? 'internal_server_error',
      message,
      requestId: request.requestId ?? 'unknown',
      path: request.originalUrl ?? request.url,
      timestamp: new Date().toISOString(),
      ...(validation ? { errors: validation } : {}),
    };

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.originalUrl} -> ${status}: ${message}`);
    }

    response.status(status).json(errorPayload);
  }

  /** Retry delay in seconds, when the exception carries one. */
  private resolveRetryAfter(exception: unknown): number | null {
    if (exception instanceof PinLockedException) {
      return Math.max(exception.retryAfterSeconds, 1);
    }
    return null;
  }

  /** Pulls `{ errors: {...} }` out of a `BadRequestException` raised by the zod pipe. */
  private extractValidationIssues(body: unknown): Record<string, string[]> | null {
    if (typeof body !== 'object' || body === null) {
      return null;
    }
    const errors = (body as { errors?: unknown }).errors;
    if (typeof errors !== 'object' || errors === null) {
      return null;
    }
    return errors as Record<string, string[]>;
  }

  private resolveClientMessage(exception: unknown, body: unknown, status: number): string {
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string' && message.length > 0) {
        return this.isValidationIssue(body) ? 'Request validation failed' : message;
      }
    }
    if (exception instanceof HttpException && status < HttpStatus.INTERNAL_SERVER_ERROR) {
      return this.defaultMessage(status);
    }
    return 'An unexpected error occurred';
  }

  private isValidationIssue(body: unknown): boolean {
    return (
      typeof body === 'object' &&
      body !== null &&
      'errors' in body &&
      typeof (body as ZodValidationIssue).message === 'string'
    );
  }

  private defaultMessage(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad request';
      case HttpStatus.UNAUTHORIZED:
        return 'Authentication required';
      case HttpStatus.FORBIDDEN:
        return 'Access denied';
      case HttpStatus.NOT_FOUND:
        return 'Resource not found';
      case HttpStatus.CONFLICT:
        return 'Resource conflict';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'Too many requests';
      default:
        return 'Request failed';
    }
  }
}