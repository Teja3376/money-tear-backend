import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { getAppConfig, type AppConfiguration } from '@/config/configuration';

export interface AuthenticatedUser {
  userId: string;
  phone: string | null;
  email: string | null;
  phoneVerified: boolean;
  provider: string | null;
  sessionId: string | null;
  authTime: number | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const JWKS_ALGORITHMS = ['RS256', 'ES256', 'EdDSA'] as const;

@Injectable()
export class SupabaseJwtVerifier {
  private readonly logger = new Logger(SupabaseJwtVerifier.name);
  private readonly config: AppConfiguration;
  private readonly jwks?: JWTVerifyGetKey;

  constructor(configService: ConfigService) {
    this.config = getAppConfig(configService);

    if (this.config.supabase.jwksUrl) {
      this.jwks = this.createKeyResolver(new URL(this.config.supabase.jwksUrl));
    }
  }

  protected createKeyResolver(url: URL): JWTVerifyGetKey {
    return createRemoteJWKSet(url, {
      // Refetch periodically so rotation is picked up.
      cacheMaxAge: 10 * 60 * 1000,
      // Serve cached keys for a short window after a JWKS refresh fails, so a
      // transient Supabase outage cannot log every user out.
      cooldownDuration: 30 * 1000,
      timeoutDuration: 5 * 1000,
    });
  }

  async verify(accessToken: string): Promise<AuthenticatedUser> {
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new UnauthorizedException('Missing access token');
    }

    let payload: JWTPayload;
    try {
      payload = await this.verifySignature(accessToken);
    } catch (error) {
      // Logged locally, never returned to the client.
      this.logger.warn(`Token verification failed: ${describeError(error)}`);
      throw new UnauthorizedException('Invalid or expired access token');
    }

    return this.toAuthenticatedUser(payload);
  }

  async verifyAuthorizationHeader(header: string | undefined): Promise<AuthenticatedUser> {
    if (!header) {
      throw new UnauthorizedException('Missing authorization header');
    }
    const [scheme, token] = header.split(' ');
    if (!token || scheme?.toLowerCase() !== 'bearer') {
      throw new UnauthorizedException('Expected an "Authorization: Bearer <token>" header');
    }
    return this.verify(token);
  }

  private async verifySignature(accessToken: string): Promise<JWTPayload> {
    const { authBaseUrl, audience, legacyJwtSecret } = this.config.supabase;

    const sharedOptions = {
      issuer: authBaseUrl,
      audience,
      // `clockTolerance` absorbs small skew between this host and Supabase.
      clockTolerance: 5,
    } as const;

    const algorithm = decodeProtectedHeader(accessToken).alg;

    if (algorithm === 'HS256') {
      if (!legacyJwtSecret) {
        throw new UnauthorizedException('Invalid or expired access token');
      }
      const { payload } = await jwtVerify(
        accessToken,
        new TextEncoder().encode(legacyJwtSecret),
        { ...sharedOptions, algorithms: ['HS256'] },
      );
      return payload;
    }

    if (!this.jwks) {
      throw new Error('No Supabase JWT verification method is configured');
    }

    const { payload } = await jwtVerify(accessToken, this.jwks, {
      ...sharedOptions,
      algorithms: [...JWKS_ALGORITHMS],
    });
    return payload;
  }

  private toAuthenticatedUser(payload: JWTPayload): AuthenticatedUser {
    const subject = payload.sub;
    if (typeof subject !== 'string' || !UUID_PATTERN.test(subject)) {
      throw new UnauthorizedException('Token subject is not a valid user id');
    }

    const phone = typeof payload.phone === 'string' ? payload.phone : null;
    const email = typeof payload.email === 'string' ? payload.email : null;

    return {
      userId: subject,
      phone,
      email,
      phoneVerified: payload.phone_verified === true,
      provider: typeof payload.provider === 'string' ? payload.provider : null,
      sessionId: typeof payload.session_id === 'string' ? payload.session_id : null,
      authTime: typeof payload.auth_time === 'number' ? payload.auth_time : null,
    };
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
