import { z } from 'zod';
import { createZodDto } from '@/common/zod/create-zod-dto';

/**
 * Uniform error envelope produced by `AllExceptionsFilter`.
 *
 * It intentionally carries a correlation id instead of a stack trace: the trace
 * is logged server-side only.
 */
export const apiErrorSchema = z.object({
  statusCode: z.number().int().describe('HTTP status code'),
  error: z.string().describe('Short machine-readable error code'),
  message: z.string().describe('Human-readable summary safe to return to a client'),
  requestId: z.string().describe('Correlation id, also present in server logs'),
  path: z.string().describe('Request path that failed'),
  timestamp: z.string().describe('ISO-8601 time the error was produced'),
  errors: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .describe('Per-field validation messages, when applicable'),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Documented shape of every non-2xx response. */
export class ApiErrorDto extends createZodDto(apiErrorSchema) {}