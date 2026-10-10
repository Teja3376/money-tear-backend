import { ConfigService } from '@nestjs/config';
import { generateKeyPair, exportJWK, SignJWT, type JWK, type CryptoKey } from 'jose';
import { CONFIG_NAMESPACE } from '@/config/configuration';
import { testConfiguration } from '@test/test-env';

/**
 * Local RSA key pair used to sign and verify tokens inside tests.
 *
 * Generated in-process; no Supabase project, JWKS endpoint or network access is
 * involved, and no test token can be valid outside this process.
 */
let cachedKeys: { privateKey: CryptoKey; publicJwk: JWK; keyId: string } | null = null;

export async function testSigningKeys(): Promise<{
  privateKey: CryptoKey;
  publicJwk: JWK;
  keyId: string;
}> {
  if (cachedKeys) {
    return cachedKeys;
  }
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const publicJwk = await exportJWK(publicKey);
  const keyId = 'test-key-1';
  cachedKeys = { privateKey, publicJwk: { ...publicJwk, kid: keyId, alg: 'RS256', use: 'sig' }, keyId };
  return cachedKeys;
}

export interface TokenOverrides {
  sub?: string;
  audience?: string | string[];
  issuer?: string;
  authTime?: number;
  expiresInSeconds?: number;
  phone?: string;
  email?: string;
  phoneVerified?: boolean;
  sessionId?: string;
}

const ISSUER = 'https://test-project.supabase.invalid/auth/v1';

/** Signs a token with the local test key. */
export async function signTestToken(overrides: TokenOverrides = {}): Promise<string> {
  const { privateKey, keyId } = await testSigningKeys();
  const issuedAt = Math.floor(Date.now() / 1000);

  const builder = new SignJWT({
    phone: overrides.phone ?? '+919876543210',
    email: overrides.email,
    phone_verified: overrides.phoneVerified ?? true,
    session_id: overrides.sessionId ?? 'session-1',
    // `auth_time` drives the recent-authentication policy.
    auth_time: overrides.authTime ?? issuedAt,
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' })
    .setSubject(overrides.sub ?? '11111111-2222-4333-8444-555555555555')
    .setIssuer(overrides.issuer ?? ISSUER)
    .setAudience(overrides.audience ?? 'authenticated')
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + (overrides.expiresInSeconds ?? 3600));

  return builder.sign(privateKey);
}

/** Epoch seconds representing "authenticated just now". */
export function nowInEpochSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** A `ConfigService` stub backed by the test configuration. */
export function testConfigService(): ConfigService {
  const config = testConfiguration();
  return new ConfigService({ [CONFIG_NAMESPACE]: config });
}