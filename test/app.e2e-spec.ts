import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { NextFunction, Request, Response } from 'express';

import { AuthController } from '@/modules/auth/auth.controller';
import { HealthController } from '@/modules/health/health.controller';
import { SecurityController } from '@/modules/security/security.controller';
import { UsersController } from '@/modules/users/users.controller';
import { AuthService } from '@/modules/auth/auth.service';
import { HealthService } from '@/modules/health/health.service';
import { SecurityService } from '@/modules/security/security.service';
import { UsersService } from '@/modules/users/users.service';
import { AuditService } from '@/modules/audit/audit.service';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';
import { RecentAuthGuard } from '@/common/guards/recent-auth.guard';
import { RequestIdMiddleware } from '@/common/middleware/request-id.middleware';
import { ConfigService } from '@nestjs/config';
import { testConfiguration } from '@test/test-env';

/**
 * HTTP-level tests for routing, validation and the error envelope.
 *
 * Services are stubbed so the suite needs no database, no Supabase project and
 * no SMS provider. What is verified here is the behaviour a client actually
 * depends on: the `/api` prefix, zod validation, and the shape of error bodies.
 */
describe('API surface (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController, UsersController, SecurityController, HealthController],
      providers: [
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: ConfigService, useValue: { getOrThrow: () => testConfiguration() } },
        RecentAuthGuard,
        { provide: AuthService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: SecurityService, useValue: {} },
        { provide: AuditService, useValue: {} },
        {
          provide: HealthService,
          useValue: {
            live: () => ({ status: 'ok', uptimeSeconds: 1 }),
            ready: async () => ({
              status: 'ok',
              uptimeSeconds: 1,
              database: { status: 'up' },
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication() as INestApplication;
    app.setGlobalPrefix('api');
    // Applied via AppModule.configure() in production; wired explicitly here.
    const middleware = new RequestIdMiddleware();
    app.use((req: Request, res: Response, next: NextFunction) =>
      middleware.use(req as never, res, next),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('serves health endpoints under /api', async () => {
    await request(app.getHttpServer()).get('/api/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/health/ready').expect(200);
  });

  it('reports database connectivity separately from process availability', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', database: { status: 'up' } });
  });

  it('validates the PIN body and rejects a malformed PIN with a 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/security/pin/verify')
      .send({ pin: '12' })
      .expect(400);

    expect(response.body.statusCode).toBe(400);
    expect(response.body.errors).toHaveProperty('pin');
  });

  it('returns a consistent error envelope', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/security/pin/verify')
      .send({})
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        error: 'bad_request',
        message: expect.any(String),
        requestId: expect.any(String),
        path: '/api/security/pin/verify',
        timestamp: expect.any(String),
      }),
    );
  });

  it('never exposes a stack trace to the client', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/security/pin/verify')
      .send({})
      .expect(400);

    expect(JSON.stringify(response.body)).not.toContain('at ');
    expect(response.body).not.toHaveProperty('stack');
  });

  it('echoes a correlation id so responses can be traced', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health/live')
      .set('X-Request-Id', 'trace-abc-123')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('trace-abc-123');
  });

  it('does not expose any /v1 route', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(404);
    await request(app.getHttpServer()).get('/v1/auth/me').expect(404);
  });
});