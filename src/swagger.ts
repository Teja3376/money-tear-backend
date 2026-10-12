import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { AppConfiguration } from '@/config/configuration';

export const SWAGGER_PATH = 'api/docs';
export const SWAGGER_JSON_PATH = 'api/docs-json';

function buildDocument(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('MoneyTear API')
    .setDescription(
      [
        'Backend for the MoneyTear mobile application.',
        '',
        '### Authentication',
        'Supabase Auth is the identity provider and handles phone OTP. The client signs in',
        'directly against Supabase and then sends the resulting access token as',
        '`Authorization: Bearer <access-token>`. Every protected endpoint verifies that',
        'token\'s signature, issuer, audience and expiry before doing anything else.',
        '',
        'Use **Authorize** in Swagger UI and paste a Supabase access token to call the',
        'protected endpoints.',
        '',
        '### Routes',
        'All routes are served under `/api`. There is no API versioning.',
        '',
        '### PIN security',
        'The 4-digit application PIN is stored as an Argon2id hash. Failed attempts are',
        'counted per user and lock the PIN temporarily; per-IP throttling applies on top of',
        'that. Setting or resetting the PIN additionally requires *recent authentication* -',
        'a sign-in performed within the configured window.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    // Paths in the document already include the `/api` prefix, so the server is
    // the origin only. Adding `/api` here would produce `/api/api/...` in
    // Swagger UI's "Try it out".
    .addServer('/', 'This host')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Supabase access token. Paste the raw token only - "Bearer " is added for you. ' +
          'No real credentials are stored in this document.',
      },
      'bearer',
    )
    .addTag('auth', 'Bootstrap, current session and logout')
    .addTag('users', 'Profile of the authenticated caller')
    .addTag('security', 'Four-digit application PIN lifecycle')
    .addTag('health', 'Liveness and readiness probes')
    .build();
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, buildDocument(), {
    // Never let an internal path leak into the published document.
    deepScanRoutes: false,
  });
}

export function setupSwagger(
  app: INestApplication,
  config: AppConfiguration,
): { ui: string; json: string } {
  if (!config.swagger.enabled) {
    return { ui: '', json: '' };
  }

  const document = createOpenApiDocument(app);

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    // Prevents the global `/api` prefix from being prepended a second time.
    useGlobalPrefix: false,
    swaggerOptions: {
      persistAuthorization: false,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
    },
    customSiteTitle: 'MoneyTear API docs',
  });

  SwaggerModule.setup(SWAGGER_JSON_PATH, app, document, {
    useGlobalPrefix: false,
    jsonDocumentUrl: SWAGGER_JSON_PATH,
  });

  return { ui: `/${SWAGGER_PATH}`, json: `/${SWAGGER_JSON_PATH}` };
}
