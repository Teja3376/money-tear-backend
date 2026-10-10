import { Injectable, Logger } from '@nestjs/common';
import { AUDIT_EVENT } from '@/common/constants/audit-event';
import { AuditService } from '@/modules/audit/audit.service';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';
import { isProfileComplete } from '@/modules/users/dto/user.dto';
import { SecurityService } from '@/modules/security/security.service';
import { UsersService } from '@/modules/users/users.service';
import type { Request } from 'express';

export interface AuthState {
  user: ReturnType<typeof toAuthUser>;
  profileComplete: boolean;
  pinConfigured: boolean;
  accountStatus: string;
  created?: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly securityService: SecurityService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Creates or returns the application user for a verified identity.
   *
   * Idempotent by construction: repeated calls converge on the same row and the
   * same response. The identity comes exclusively from the verified token, so a
   * caller cannot bootstrap an account for somebody else.
   */
  async bootstrap(identity: AuthenticatedUser, request?: Request): Promise<AuthState> {
    const { user, created } = await this.usersService.bootstrap(identity);

    const pin = await this.securityService.getStatus(user.id);

    await this.auditService.record({
      eventType: AUDIT_EVENT.BOOTSTRAP_COMPLETED,
      success: true,
      userId: user.id,
      request,
      metadata: { provider: identity.provider ?? 'unknown' },
    });

    const state: AuthState = {
      user: toAuthUser(user),
      profileComplete: isProfileComplete(user),
      pinConfigured: pin.configured,
      accountStatus: user.status,
      created,
    };

    if (created) {
      this.logger.log(`Created application user ${user.id}`);
    }

    return state;
  }

  /** Current authenticated application user and its derived flags. */
  async me(identity: AuthenticatedUser): Promise<AuthState> {
    const user = await this.usersService.findById(identity.userId);
    if (!user) {
      return this.bootstrap(identity);
    }

    const pin = await this.securityService.getStatus(user.id);

    return {
      user: toAuthUser(user),
      profileComplete: isProfileComplete(user),
      pinConfigured: pin.configured,
      accountStatus: user.status,
    };
  }

  /**
   * Records a logout.
   *
   * The backend's supported behaviour is an audited acknowledgement: it records
   * the event and returns. It does **not** revoke Supabase refresh tokens (that
   * requires a privileged identity-provider call this phase deliberately avoids),
   * and it cannot clear credentials held by the client - disposing of the access
   * and refresh tokens is the mobile client's responsibility.
   */
  async logout(identity: AuthenticatedUser, request?: Request): Promise<{ loggedOut: boolean; scope: string }> {
    await this.auditService.record({
      eventType: AUDIT_EVENT.LOGOUT_REQUESTED,
      success: true,
      userId: identity.userId,
      request,
      metadata: { sessionId: identity.sessionId ?? 'unknown' },
    });

    return {
      loggedOut: true,
      scope:
        'Audit event recorded. Server-side revocation of Supabase refresh tokens is not performed in this phase; the client must dispose of its access and refresh tokens.',
    };
  }
}

/** Narrow projection of the user for auth responses (no security metadata). */
function toAuthUser(user: {
  id: string;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
  role: string;
  status: string;
  onboardingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    phone: user.phone ?? null,
    email: user.email ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    dateOfBirth: user.dateOfBirth ?? null,
    role: user.role,
    status: user.status,
    onboardingCompletedAt: user.onboardingCompletedAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}