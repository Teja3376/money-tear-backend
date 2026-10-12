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
import type { RequestWithId } from '@/common/interceptors/request-id.interceptor';
import { ValidationIssue } from '@/common/pipes/validation.pipe';

const ERROR_CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'bad_request',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.TOO_MANY_REQUESTS]: 'too_many_requests',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'service_unavailable',
};

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

  private resolveRetryAfter(exception: unknown): number | null {
    if (exception instanceof PinLockedException) {
      return Math.max(exception.retryAfterSeconds, 1);
    }
    return null;
  }

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
      typeof (body as ValidationIssue).message === 'string'
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
