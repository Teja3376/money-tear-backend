import { HttpException, HttpStatus } from '@nestjs/common';

export class PinLockedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many incorrect PIN attempts. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
