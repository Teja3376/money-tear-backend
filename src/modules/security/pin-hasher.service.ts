import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id parameters.
 *
 * OWASP's recommended baseline for Argon2id is m=19456 KiB, t=2, p=1 - these are
 * the defaults used here. They are explicit (rather than library defaults) so a
 * future upgrade is a reviewed change, and so a stored hash always records the
 * parameters it was created with.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Hashes and verifies application PINs.
 *
 * Argon2id is used rather than bcrypt or a bare SHA-256: a 4-digit PIN has only
 * 10^4 possible values, so a fast hash would be trivially brute-forced from a
 * stolen database. Argon2id's memory/time cost makes each guess expensive, and the
 * per-hash salt prevents precomputed lookup tables.
 *
 * The plaintext PIN is never stored, logged, returned or cached.
 */
@Injectable()
export class PinHasher {
  hashPin(pin: string): Promise<string> {
    return hash(pin, ARGON2_OPTIONS);
  }

  async verifyPin(pinHash: string, pin: string): Promise<boolean> {
    try {
      return await verify(pinHash, pin, ARGON2_OPTIONS);
    } catch {
      // A malformed or foreign-format hash must read as "no match", never as a 500.
      return false;
    }
  }
}