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

/**
 * Identity derived **only** from a cryptographically verified Supabase token.
 *
 * `userId` comes from the `sub` claim. It is never taken from a request body,
 * query string or client-supplied header - those are attacker-controlled.
 */
export interface AuthenticatedUser {
  /** Supabase Auth user id (UUID). Matches `users.id`. */
  userId: string;
  phone: string | null;
  email: string | null;
  phoneVerified: boolean;
  /** Supabase auth provider (`phone`, `email`, ...). */
  provider: string | null;
  /** Supabase session id, when the token carries one. */
  sessionId: string | null;
  /**
   * Epoch seconds of the original successful authentication, taken from the
   * `auth_time` claim. Drives the step-up (recent authentication) policy.
   */
  authTime: number | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Algorithm allow-list: asymmetric for JWKS, symmetric only when explicitly configured. */
const JWKS_ALGORITHMS = ['RS256', 'ES256', 'EdDSA'] as const;

/**
 * Verifies Supabase access tokens.
 *
 * Verification strategy (see AUTH_BACKEND_PLAN.md):
 *  - Asymmetric projects: the token is verified against Supabase's remote JWKS.
 *    A `createRemoteJWKSet` cache is used with `cooldownDuration`, so Supabase
 *    can rotate signing keys and previously issued tokens keep working without
 *    trusting an unknown key.
 *  - Legacy HS256 projects: verified only when `SUPABASE_JWT_SECRET` is set.
 *    The symmetric path is never used as a fallback when JWKS is configured,
 *    which removes the algorithm-confusion class of attack.
 */
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

  /**
   * Builds the key resolver for asymmetric projects.
   *
   * Declared as a seam rather than inlined so tests can substitute a local JWKS
   * (`jose.createLocalJWKSet`) and exercise the real signature/issuer/audience
   * path without any network access.
   */
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

  /**
   * Verifies the token signature and claims, then returns a typed identity.
   *
   * Every failure path raises `UnauthorizedException` with a generic message: the
   * client learns that authentication failed, never *why* the token was rejected.
   */
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

  /**
   * Extracts and verifies the `Authorization: Bearer` header.
   *
   * `async` so every failure - malformed header *and* invalid token - surfaces as
   * a rejected promise. A guard can then treat the call uniformly.
   */
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

  /**
   * Verifies the signature.
   *
   * The verification method is chosen from the token's own algorithm header, and
   * each method is only ever permitted under its own conditions:
   *  - `HS256` requires `SUPABASE_JWT_SECRET` to be configured explicitly;
   *  - everything else must verify against the project's JWKS, and the asymmetric
   *    path never accepts `HS256`.
   *
   * That split removes the algorithm-confusion attack: an attacker cannot take a
   * token the verifier would treat as asymmetric and have it re-verified against
   * a public key as if it were symmetric.
   */
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

  /** Maps verified claims onto the application identity. Payload is already trusted here. */
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