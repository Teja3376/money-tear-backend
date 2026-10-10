import { beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';

import { AuthController } from '@/modules/auth/auth.controller';
import { AuthService } from '@/modules/auth/auth.service';
import { HealthController } from '@/modules/health/health.controller';
import { HealthService } from '@/modules/health/health.service';
import { SecurityController } from '@/modules/security/security.controller';
import { SecurityService } from '@/modules/security/security.service';
import { UsersController } from '@/modules/users/users.controller';
import { UsersService } from '@/modules/users/users.service';
import { AuditService } from '@/modules/audit/audit.service';
import { RecentAuthGuard } from '@/common/guards/recent-auth.guard';
import { testConfiguration } from '@test/test-env';
import { SWAGGER_JSON_PATH, SWAGGER_PATH, createOpenApiDocument } from '@/swagger';

/**
 * Document generation depends only on controller and DTO metadata, so the
 * document is built from the real controllers with stubbed services. This keeps
 * the test fast and free of any database connection while still asserting the
 * contract that clients and codegen tools consume.
 */
async function buildDocument(): Promise<OpenAPIObject> {
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController, UsersController, SecurityController, HealthController],
    providers: [
      // `RecentAuthGuard` is referenced by @UseGuards on the setup/reset routes,
      // so Nest instantiates it even though the guards are never executed here.
      { provide: ConfigService, useValue: { getOrThrow: () => testConfiguration() } },
      RecentAuthGuard,
      { provide: AuthService, useValue: {} },
      { provide: UsersService, useValue: {} },
      { provide: SecurityService, useValue: {} },
      { provide: AuditService, useValue: {} },
      { provide: HealthService, useValue: {} },
    ],
  }).compile();

  const app = moduleRef.createNestApplication() as INestApplication;
  // Production sets this global prefix; the document must reflect it.
  app.setGlobalPrefix('api');
  await app.init();

  const document = createOpenApiDocument(app);
  await app.close();
  return document;
}

/** Every route the specification requires. */
const REQUIRED_OPERATIONS: Array<[string, string]> = [
  ['post', '/api/auth/bootstrap'],
  ['get', '/api/auth/me'],
  ['post', '/api/auth/logout'],
  ['get', '/api/users/me'],
  ['patch', '/api/users/me'],
  ['post', '/api/security/pin/setup'],
  ['post', '/api/security/pin/verify'],
  ['post', '/api/security/pin/change'],
  ['post', '/api/security/pin/reset'],
  ['get', '/api/security/pin/status'],
  ['get', '/api/health/live'],
  ['get', '/api/health/ready'],
];

describe('OpenAPI document', () => {
  let document: OpenAPIObject;

  beforeAll(async () => {
    document = await buildDocument();
  }, 30_000);

  it('is generated as OpenAPI 3.0', () => {
    expect(document.openapi).toBe('3.0.0');
    expect(document.info.title).toBe('MoneyTear API');
  });

  it.each(REQUIRED_OPERATIONS)('documents %s %s', (method, path) => {
    const pathItem = document.paths[path] as Record<string, unknown> | undefined;
    expect(pathItem).toBeDefined();
    expect(pathItem?.[method]).toBeDefined();
  });

  it('uses no API versioning anywhere', () => {
    const offending = Object.keys(document.paths ?? {}).filter((path) =>
      /(^|\/)v\d+(\/|$)/i.test(path),
    );

    expect(offending).toEqual([]);
  });

  it('prefixes every documented path with /api and nothing else', () => {
    const paths = Object.keys(document.paths ?? {});

    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.startsWith('/api')).toBe(true);
      // Guards against the doubled `/api/api/...` prefix.
      expect(path.startsWith('/api/api')).toBe(false);
    }
  });

  it('declares a bearer JWT security scheme matching the guard', () => {
    const schemes = document.components?.securitySchemes ?? {};

    expect(schemes['bearer']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('requires the bearer scheme on protected operations and omits it on health probes', () => {
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      const isPublic = path.startsWith('/api/health');
      for (const [method, operation] of Object.entries(methods)) {
        const spec = operation as { security?: unknown };
        if (isPublic) {
          expect(spec.security, `${method} ${path}`).toBeUndefined();
        } else {
          expect(spec.security, `${method} ${path}`).toEqual([{ bearer: [] }]);
        }
      }
    }
  });

  it('documents request bodies for every endpoint that accepts one', () => {
    const withBodies = [
      ['patch', '/api/users/me'],
      ['post', '/api/security/pin/setup'],
      ['post', '/api/security/pin/verify'],
      ['post', '/api/security/pin/change'],
    ] as const;

    for (const [method, path] of withBodies) {
      const operation = document.paths[path]?.[method] as { requestBody?: unknown };
      expect(operation.requestBody, `${method} ${path}`).toBeDefined();
    }
  });

  it('documents the PIN contract accurately (four digits, required fields)', () => {
    const schemas = document.components?.schemas ?? {};
    const setup = schemas['SetupPinDto'] as
      | { properties: Record<string, { pattern?: string }>; required: string[] }
      | undefined;

    expect(setup).toBeDefined();
    expect(setup?.required).toEqual(expect.arrayContaining(['pin', 'confirmPin']));
    expect(setup?.properties['pin']?.pattern).toBe('^[0-9]{4}$');
    expect(setup?.properties['confirmPin']?.pattern).toBe('^[0-9]{4}$');
  });

  it('marks every profile field optional for a PATCH', () => {
    const schemas = document.components?.schemas ?? {};
    const update = schemas['UpdateProfileDto'] as { required?: string[] } | undefined;

    expect(update?.required ?? []).toEqual([]);
  });

  it('documents the error envelope used by non-2xx responses', () => {
    const schemas = document.components?.schemas ?? {};
    const error = schemas['ApiErrorDto'] as { properties?: Record<string, unknown> } | undefined;

    expect(error).toBeDefined();
    expect(Object.keys(error?.properties ?? {})).toEqual(
      expect.arrayContaining(['statusCode', 'error', 'message', 'requestId', 'path', 'timestamp']),
    );
  });

  it('never exposes secret material in the document', () => {
    const serialised = JSON.stringify(document);

    expect(serialised).not.toMatch(/argon2/);
    expect(serialised).not.toContain('pinHash');
    expect(serialised).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(serialised).not.toContain('DB_PASSWORD');
  });

  it('gives every documented operation a summary', () => {
    for (const [path, methods] of Object.entries(document.paths ?? {})) {
      for (const [method, operation] of Object.entries(methods)) {
        expect((operation as { summary?: string }).summary, `${method} ${path}`).toBeTruthy();
      }
    }
  });

  it('mounts UI and JSON under the documented paths, without duplicating /api', () => {
    // `useGlobalPrefix: false` in `setupSwagger` is what keeps these from
    // becoming /api/api/docs at runtime.
    expect(SWAGGER_PATH).toBe('api/docs');
    expect(SWAGGER_JSON_PATH).toBe('api/docs-json');
    expect(SWAGGER_PATH.startsWith('/')).toBe(false);
    expect(SWAGGER_JSON_PATH.startsWith('/')).toBe(false);
  });
});