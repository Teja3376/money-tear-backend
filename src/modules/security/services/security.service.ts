import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getAppConfig, type AppConfiguration } from '@/config/configuration';
import { AUDIT_EVENT } from '@/common/constants/audit-event';
import { PinLockedException } from '@/common/errors/pin-locked.exception';
import { AuditService } from '@/modules/audit/services/audit.service';
import { UserSecurity } from '@/modules/security/entities/user-security.entity';
import { PinHasher } from '@/modules/security/services/pin-hasher.service';
import { PinUnlockService } from '@/modules/security/services/pin-unlock.service';
import type { SetupPinInput } from '@/modules/security/dto/setup-pin.dto';
import type { ChangePinInput } from '@/modules/security/dto/change-pin.dto';
import type { Request } from 'express';

const GENERIC_INVALID_PIN = 'Invalid PIN';

export interface PinVerifyOutcome {
  verified: boolean;
  unlockedUntil: Date | null;
}

export interface PinMutationOutcome {
  success: boolean;
  configured: boolean;
}

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly config: AppConfiguration;

  constructor(
    @InjectRepository(UserSecurity)
    private readonly securityRepository: Repository<UserSecurity>,
    private readonly pinHasher: PinHasher,
    private readonly pinUnlockService: PinUnlockService,
    private readonly auditService: AuditService,
    configService: ConfigService,
  ) {
    this.config = getAppConfig(configService);
  }

  async setupPin(
    userId: string,
    input: SetupPinInput,
    request?: Request,
  ): Promise<PinMutationOutcome> {
    const existing = await this.loadSecurity(userId);

    if (existing?.pinHash) {
      await this.auditService.record({
        eventType: AUDIT_EVENT.PIN_SETUP_REJECTED,
        success: false,
        userId,
        request,
        metadata: { reason: 'already_configured' },
      });
      throw new ConflictException('A PIN is already configured. Use change or reset instead.');
    }

    const pinHash = await this.pinHasher.hashPin(input.pin);
    const now = new Date();

    if (existing) {
      await this.securityRepository.update(
        { userId },
        {
          pinHash,
          pinSetAt: now,
          failedPinAttempts: 0,
          lockedUntil: null,
        },
      );
    } else {
      await this.securityRepository.insert({
        userId,
        pinHash,
        pinSetAt: now,
        failedPinAttempts: 0,
        lockedUntil: null,
      });
    }

    // A PIN change/reset must never leave a stale unlock behind.
    this.pinUnlockService.lock(userId);

    await this.auditService.record({
      eventType: AUDIT_EVENT.PIN_SETUP_SUCCEEDED,
      success: true,
      userId,
      request,
    });

    return { success: true, configured: true };
  }

  async verifyPin(userId: string, pin: string, request?: Request): Promise<PinVerifyOutcome> {
    const security = await this.loadSecurity(userId);

    if (!security?.pinHash) {
      throw new ConflictException('No PIN has been configured for this account');
    }

    if (this.isLocked(security)) {
      await this.auditService.record({
        eventType: AUDIT_EVENT.PIN_VERIFY_LOCKED,
        success: false,
        userId,
        request,
        metadata: { lockedSeconds: this.remainingLockSeconds(security) },
      });
      throw this.lockedError(this.remainingLockSeconds(security));
    }

    const matches = await this.pinHasher.verifyPin(security.pinHash, pin);

    if (!matches) {
      const justLocked = await this.registerFailedAttempt(userId);
      if (justLocked) {
        // The attempt that exhausts the budget is reported as a lockout straight
        // away, so the client stops rather than spending more requests on a PIN
        // it is already locked out of.
        await this.auditService.record({
          eventType: AUDIT_EVENT.PIN_VERIFY_LOCKED,
          success: false,
          userId,
          request,
          metadata: { lockedSeconds: this.config.auth.pin.lockSeconds },
        });
        throw this.lockedError(this.config.auth.pin.lockSeconds);
      }

      await this.auditService.record({
        eventType: AUDIT_EVENT.PIN_VERIFY_FAILED,
        success: false,
        userId,
        request,
      });
      throw new UnauthorizedException(GENERIC_INVALID_PIN);
    }

    // Success resets the counters and opens the short-lived unlock state.
    await this.securityRepository.update(
      { userId },
      { failedPinAttempts: 0, lockedUntil: null },
    );
    const unlockedUntil = this.pinUnlockService.unlock(
      userId,
      this.config.auth.pin.unlockTtlSeconds,
    );

    await this.auditService.record({
      eventType: AUDIT_EVENT.PIN_VERIFY_SUCCEEDED,
      success: true,
      userId,
      request,
    });

    return { verified: true, unlockedUntil };
  }

  async changePin(
    userId: string,
    input: ChangePinInput,
    request?: Request,
  ): Promise<PinMutationOutcome> {
    const security = await this.loadSecurity(userId);

    if (!security?.pinHash) {
      await this.auditService.record({
        eventType: AUDIT_EVENT.PIN_CHANGE_FAILED,
        success: false,
        userId,
        request,
        metadata: { reason: 'not_configured' },
      });
      throw new ConflictException('No PIN has been configured for this account');
    }

    if (this.isLocked(security)) {
      await this.auditService.record({
        eventType: AUDIT_EVENT.PIN_CHANGE_FAILED,
        success: false,
        userId,
        request,
        metadata: { reason: 'locked' },
      });
      throw this.lockedError(this.remainingLockSeconds(security));
    }

    const currentMatches = await this.pinHasher.verifyPin(security.pinHash, input.currentPin);
    if (!currentMatches) {
      await this.registerFailedAttempt(userId);
      await this.auditService.record({
        eventType: AUDIT_EVENT.PIN_CHANGE_FAILED,
        success: false,
        userId,
        request,
        metadata: { reason: 'current_pin_mismatch' },
      });
      throw new UnauthorizedException(GENERIC_INVALID_PIN);
    }

    // Reject a no-op change by comparing against the stored hash.
    if (await this.pinHasher.verifyPin(security.pinHash, input.newPin)) {
      await this.auditService.record({
        eventType: AUDIT_EVENT.PIN_CHANGE_FAILED,
        success: false,
        userId,
        request,
        metadata: { reason: 'same_pin' },
      });
      throw new ConflictException('The new PIN must differ from the current PIN');
    }

    const pinHash = await this.pinHasher.hashPin(input.newPin);
    await this.securityRepository.update(
      { userId },
      {
        pinHash,
        pinSetAt: new Date(),
        failedPinAttempts: 0,
        lockedUntil: null,
      },
    );

    this.pinUnlockService.lock(userId);

    await this.auditService.record({
      eventType: AUDIT_EVENT.PIN_CHANGE_SUCCEEDED,
      success: true,
      userId,
      request,
    });

    return { success: true, configured: true };
  }

  async resetPin(userId: string, request?: Request): Promise<PinMutationOutcome> {
    await this.securityRepository.update(
      { userId },
      {
        pinHash: null,
        pinSetAt: null,
        failedPinAttempts: 0,
        lockedUntil: null,
      },
    );

    // The unlock state must not survive a reset.
    this.pinUnlockService.lock(userId);

    await this.auditService.record({
      eventType: AUDIT_EVENT.PIN_RESET_SUCCEEDED,
      success: true,
      userId,
      request,
    });

    return { success: true, configured: false };
  }

  async getStatus(
    userId: string,
  ): Promise<{ configured: boolean; updatedAt: string | null }> {
    const security = await this.loadSecurity(userId);
    return {
      configured: Boolean(security?.pinHash),
      updatedAt: security?.updatedAt ? security.updatedAt.toISOString() : null,
    };
  }

  private async loadSecurity(userId: string): Promise<UserSecurity | null> {
    return this.securityRepository.findOne({ where: { userId } });
  }

  private isLocked(security: UserSecurity, now: Date = new Date()): boolean {
    return security.lockedUntil !== null && security.lockedUntil.getTime() > now.getTime();
  }

  private remainingLockSeconds(security: UserSecurity, now: Date = new Date()): number {
    if (!security.lockedUntil) {
      return 0;
    }
    return Math.max(0, Math.ceil((security.lockedUntil.getTime() - now.getTime()) / 1000));
  }

  private async registerFailedAttempt(userId: string): Promise<boolean> {
    const { maxAttempts, lockSeconds } = this.config.auth.pin;

    const result = await this.securityRepository
      .createQueryBuilder()
      .update(UserSecurity)
      .set({ failedPinAttempts: () => '"failed_pin_attempts" + 1' })
      .where('"user_id" = :userId', { userId })
      .returning(['"failed_pin_attempts"'])
      .execute();

    const attempts = readReturnedAttempts(result.raw);
    if (attempts === null || attempts < maxAttempts) {
      return false;
    }

    const lockedUntil = new Date(Date.now() + lockSeconds * 1000);
    await this.securityRepository.update({ userId }, { lockedUntil });
    this.logger.warn(`PIN locked for user ${userId} until ${lockedUntil.toISOString()}`);
    return true;
  }

  private lockedError(remainingSeconds: number): PinLockedException {
    return new PinLockedException(Math.max(remainingSeconds, 1));
  }
}

function readReturnedAttempts(raw: unknown): number | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const row = raw[0] as Record<string, unknown>;
  const value = row?.failed_pin_attempts;
  return typeof value === 'number' ? value : null;
}
