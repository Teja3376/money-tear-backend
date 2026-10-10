import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Raised when the application PIN is temporarily locked after repeated failures.
 *
 * `HttpException` cannot carry response headers, so the retry hint travels on the
 * exception and `AllExceptionsFilter` emits it as `Retry-After`. The message is
 * deliberately identical for every lockout: a caller learns only that the PIN is
 * currently unavailable, never why.
 */
export class PinLockedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many incorrect PIN attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}