import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

/** Shape of the validation payload rejected by this pipe. */
export interface ZodValidationIssue {
  message: string;
  errors: Record<string, string[]>;
}

/** Flattens a zod error into `{ field: [messages] }` without leaking internals. */
export function formatZodError(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (formatted[key] ??= []).push(issue.message);
  }
  return formatted;
}

/**
 * Runtime validation backed by zod.
 *
 * Registered globally in `AppModule`. When a route parameter is typed with a DTO
 * produced by `createZodDto`, the class carries a static `schema`; this pipe
 * picks it up automatically, so controllers need no `@UsePipes` decorators and
 * cannot accidentally skip validation.
 *
 * The parsed result replaces the raw payload, so handlers only ever see validated
 * and transformed data - unknown keys are stripped by the schema.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform<unknown, unknown> {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = this.resolveSchema(metadata.metatype);

    // Not a schema-backed DTO (e.g. a built-in type) - leave it untouched.
    if (!schema) {
      return value;
    }

    const result = schema.safeParse(value);
    if (!result.success) {
      const payload: ZodValidationIssue = {
        message: `Validation failed for ${metadata.type ?? 'body'}`,
        errors: formatZodError(result.error),
      };
      throw new BadRequestException(payload);
    }

    return result.data;
  }

  private resolveSchema(metatype: unknown): ZodType | null {
    if (typeof metatype !== 'function' && typeof metatype !== 'object') {
      return null;
    }
    const candidate = (metatype as { schema?: unknown }).schema;
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as ZodType).safeParse === 'function'
    ) {
      return candidate as ZodType;
    }
    return null;
  }
}