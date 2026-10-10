import { describe, expect, it } from 'vitest';
import { PinHasher } from '@/modules/security/pin-hasher.service';

describe('PinHasher', () => {
  const hasher = new PinHasher();

  it('produces an Argon2id hash, never a reversible encoding of the PIN', async () => {
    const hash = await hasher.hashPin('1234');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('1234');
  });

  it('verifies a matching PIN', async () => {
    const hash = await hasher.hashPin('4821');

    await expect(hasher.verifyPin(hash, '4821')).resolves.toBe(true);
  });

  it('rejects a non-matching PIN', async () => {
    const hash = await hasher.hashPin('4821');

    await expect(hasher.verifyPin(hash, '4822')).resolves.toBe(false);
  });

  it('salts each hash, so identical PINs produce different digests', async () => {
    const [first, second] = await Promise.all([hasher.hashPin('1234'), hasher.hashPin('1234')]);

    expect(first).not.toBe(second);
    // Both still verify - the salt does not break verification.
    await expect(hasher.verifyPin(first, '1234')).resolves.toBe(true);
    await expect(hasher.verifyPin(second, '1234')).resolves.toBe(true);
  });

  it('treats a malformed stored hash as a non-match rather than throwing', async () => {
    await expect(hasher.verifyPin('not-a-hash', '1234')).resolves.toBe(false);
    await expect(hasher.verifyPin('', '1234')).resolves.toBe(false);
  });

  it('does not verify a PIN against a hash produced for a different PIN', async () => {
    const hash = await hasher.hashPin('1111');

    await expect(hasher.verifyPin(hash, '2222')).resolves.toBe(false);
  });
});