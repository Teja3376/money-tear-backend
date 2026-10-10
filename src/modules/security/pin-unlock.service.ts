import { Injectable } from '@nestjs/common';

/**
 * Short-lived, **server-side** record that a user recently proved knowledge of
 * their PIN.
 *
 * Why this exists: the task explicitly forbids treating a client-side boolean as
 * authorization. A `POST /pin/verify` that simply replies `{ verified: true }`
 * gives the client - which is the untrusted party - full control of the answer.
 * Here the success is recorded on the server, and any future high-risk operation
 * can require it through `PinUnlockedGuard`.
 *
 * Scope and limitations (documented in AUTH_BACKEND_PLAN.md):
 *  - stored per process in memory, so it resets on restart and is not shared
 *    across replicas. A Redis-backed store is the production follow-up when the
 *    API runs multi-instance;
 *  - keyed by user id and expired on a timer, so entries cannot accumulate;
 *  - no endpoint in this phase *requires* unlock state yet - it is invalidated on
 *    setup/change/reset so a future consumer starts from a clean state.
 */
@Injectable()
export class PinUnlockService {
  private readonly unlockedUntilByUser = new Map<string, number>();

  /**
   * Clock seam for tests.
   *
   * Declared as a method rather than a constructor parameter so Nest's injector
   * does not try to resolve a plain function as a dependency.
   */
  protected now(): number {
    return Date.now();
  }

  /** Records a successful verification. Returns the resulting expiry, or `null` if ttl <= 0. */
  unlock(userId: string, ttlSeconds: number): Date | null {
    if (ttlSeconds <= 0) {
      this.lock(userId);
      return null;
    }

    const expiresAt = this.now() + ttlSeconds * 1000;
    this.unlockedUntilByUser.set(userId, expiresAt);
    return new Date(expiresAt);
  }

  isUnlocked(userId: string): boolean {
    const expiresAt = this.unlockedUntilByUser.get(userId);
    if (expiresAt === undefined) {
      return false;
    }
    if (expiresAt <= this.now()) {
      this.unlockedUntilByUser.delete(userId);
      return false;
    }
    return true;
  }

  /** Expiry timestamp, or `null` when not unlocked. */
  getExpiry(userId: string): Date | null {
    if (!this.isUnlocked(userId)) {
      return null;
    }
    return new Date(this.unlockedUntilByUser.get(userId) as number);
  }

  /** Revokes any unlock state, e.g. after a PIN change or reset. */
  lock(userId: string): void {
    this.unlockedUntilByUser.delete(userId);
  }
}