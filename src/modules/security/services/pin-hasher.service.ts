import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

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
