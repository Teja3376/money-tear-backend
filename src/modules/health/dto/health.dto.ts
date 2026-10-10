import { z } from 'zod';
import { createZodDto } from '@/common/zod/create-zod-dto';

export const livenessSchema = z.object({
  status: z.literal('ok').describe('Process is running'),
  uptimeSeconds: z.number().int().describe('Seconds since process start'),
});

export const readinessSchema = z.object({
  status: z.enum(['ok', 'degraded']).describe('"degraded" when the database is unreachable'),
  uptimeSeconds: z.number().int(),
  database: z.object({
    status: z.enum(['up', 'down']),
    error: z.string().optional().describe('Present only when the database check failed'),
  }),
});

export class LivenessDto extends createZodDto(livenessSchema) {}
export class ReadinessDto extends createZodDto(readinessSchema) {}