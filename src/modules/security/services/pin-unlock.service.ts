import { Injectable } from '@nestjs/common';

@Injectable()
export class PinUnlockService {
  private readonly unlockedUntilByUser = new Map<string, number>();

  protected now(): number {
    return Date.now();
  }

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

  getExpiry(userId: string): Date | null {
    if (!this.isUnlocked(userId)) {
      return null;
    }
    return new Date(this.unlockedUntilByUser.get(userId) as number);
  }

  lock(userId: string): void {
    this.unlockedUntilByUser.delete(userId);
  }
}
