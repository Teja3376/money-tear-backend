import { BadRequestException, Injectable, ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export interface ValidationIssue {
  message: string;
  errors: Record<string, string[]>;
}

export function formatValidationErrors(errors: ValidationError[]): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const error of errors) {
    const messages = error.constraints ? Object.values(error.constraints) : [];
    if (error.children && error.children.length > 0) {
      const nested = formatValidationErrors(error.children);
      for (const [key, value] of Object.entries(nested)) {
        formatted[`${error.property}.${key}`] = value;
      }
    } else {
      formatted[error.property] = messages;
    }
  }
  return formatted;
}

@Injectable()
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const payload: ValidationIssue = {
          message: 'Validation failed',
          errors: formatValidationErrors(errors),
        };
        return new BadRequestException(payload);
      },
    });
  }
}
