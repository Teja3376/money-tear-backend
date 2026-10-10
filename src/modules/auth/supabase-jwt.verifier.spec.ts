import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLocalJWKSet, type JWTVerifyGetKey } from 'jose';
import { buildConfiguration } from '@/config/configuration';
import { validateEnv } from '@/config/validation';
import { CONFIG_NAMESPACE } from '@/config/configuration';
import { SupabaseJwtVerifier } from '@/modules/auth/supabase-jwt.verifier';
import { TEST_ENV, testEnv } from '@test/test-env';
import { nowInEpochSeconds, signTestToken, testSigningKeys } from '@test/test-tokens';

async function createVerifier(
  envOverrides: Record<string, string | undefined> = {},
): Promise<SupabaseJwtVerifier> {
  const { publicJwk } = await testSigningKeys();
  const env = validateEnv(testEnv(envOverrides));

  const TestVerifier = class extends SupabaseJwtVerifier {
    protected override createKeyResolver(): JWTVerifyGetKey {
      return createLocalJWKSet({ keys: [publicJwk] });
    }
  };

  return new TestVerifier(new ConfigService({ [CONFIG_NAMESPACE]: buildConfiguration(env) }));
}

describe('SupabaseJwtVerifier', () => {
  describe('valid tokens', () => {
    it('accepts a correctly signed token and derives the identity', async () => {
      const verifier = await createVerifier();
      const userId = '11111111-2222-4333-8444-555555555555';
      const token = await signTestToken({ sub: userId, phone: '+919876543210' });

      const identity = await verifier.verify(token);

      expect(identity.userId).toBe(userId);
      expect(identity.phone).toBe('+919876543210');
      expect(identity.phoneVerified).toBe(true);
      expect(identity.sessionId).toBe('session-1');
      expect(identity.authTime).toBeTypeOf('number');
    });

    it('exposes auth_time so the recent-auth policy can use it', async () => {
      const verifier = await createVerifier();
      const authTime = nowInEpochSeconds() - 60;
      const token = await signTestToken({ authTime });

      const identity = await verifier.verify(token);

      expect(identity.authTime).toBe(authTime);
    });
  });

  describe('rejected tokens', () => {
    it('rejects an expired token', async () => {
      const verifier = await createVerifier();
      const token = await signTestToken({ expiresInSeconds: -3600 });

      await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token from a different issuer', async () => {
      const verifier = await createVerifier();
      const token = await signTestToken({ issuer: 'https://attacker.invalid/auth/v1' });

      await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token with the wrong audience', async () => {
      const verifier = await createVerifier();
      const token = await signTestToken({ audience: 'some-other-audience' });

      await expect(verifier.verify(token)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a malformed token', async () => {
      const verifier = await createVerifier();

      await expect(verifier.verify('not-a-jwt')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an empty token', async () => {
      const verifier = await createVerifier();

      await expect(verifier.verify('')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a token whose subject is not a UUID', async () => {
      const verifier = await createVerifier();
      const token = await signTestToken({ sub: 'not-a-uuid' });

      await expect(verifier.verify(token)).rejects.toThrow(/not a valid user id/i);
    });

    it('rejects a token signed by an unknown key', async () => {
      const verifier = await createVerifier();
      // A structurally valid token signed by a key that is not in the JWKS.
      const { generateKeyPair, SignJWT } = await import('jose');
      const { privateKey } = await generateKeyPair('RS256');
      const forged = await new SignJWT({ phone: '+919876543210' })
        .setProtectedHeader({ alg: 'RS256', kid: 'attacker-key', typ: 'JWT' })
        .setSubject('11111111-2222-4333-8444-555555555555')
        .setIssuer('https://test-project.supabase.invalid/auth/v1')
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);

      await expect(verifier.verify(forged)).rejects.toThrow(UnauthorizedException);
    });

    it('returns a generic message that does not reveal the rejection reason', async () => {
      const verifier = await createVerifier();
      const token = await signTestToken({ issuer: 'https://attacker.invalid/auth/v1' });

      await expect(verifier.verify(token)).rejects.toThrow('Invalid or expired access token');
    });
  });

  describe('authorization header parsing', () => {
    it('rejects a missing header', async () => {
      const verifier = await createVerifier();

      await expect(verifier.verifyAuthorizationHeader(undefined)).rejects.toThrow(
        'Missing authorization header',
      );
    });

    it('rejects a non-bearer scheme', async () => {
      const verifier = await createVerifier();

      await expect(verifier.verifyAuthorizationHeader('Basic abc123')).rejects.toThrow(
        /Authorization: Bearer/,
      );
    });

    it('accepts a well-formed bearer header regardless of scheme casing', async () => {
      const verifier = await createVerifier();
      const token = await signTestToken();

      const identity = await verifier.verifyAuthorizationHeader(`bearer ${token}`);

      expect(identity.userId).toBeTruthy();
    });
  });

  describe('legacy HS256 projects', () => {
    it('verifies an HS256 token when a signing secret is configured', async () => {
      const secret = 'a-32-character-test-secret-value!!';
      const verifier = await createVerifier({ SUPABASE_JWT_SECRET: secret });

      const { SignJWT } = await import('jose');
      const token = await new SignJWT({ phone: '+919876543210' })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject('11111111-2222-4333-8444-555555555555')
        .setIssuer('https://test-project.supabase.invalid/auth/v1')
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode(secret));

      const identity = await verifier.verify(token);

      expect(identity.userId).toBe('11111111-2222-4333-8444-555555555555');
    });
  });

  describe('test isolation', () => {
    it('never points at a real Supabase project', () => {
      expect(TEST_ENV.SUPABASE_URL).toContain('.invalid');
    });
  });
});