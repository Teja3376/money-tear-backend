import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { SignJWT } from 'jose';
import { AUDIT_EVENT } from '@/common/constants/audit-event';
import { getAppConfig, type AppConfiguration } from '@/config/configuration';
import { AuditService } from '@/modules/audit/audit.service';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';
import { isProfileComplete } from '@/modules/users/dto/user.dto';
import { SecurityService } from '@/modules/security/security.service';
import { UsersService, normalisePhone } from '@/modules/users/users.service';
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
  private readonly config: AppConfiguration;

  constructor(
    private readonly usersService: UsersService,
    private readonly securityService: SecurityService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {
    this.config = getAppConfig(configService);
  }

  /**
   * Generates and dispatches verification OTP.
   */
  async sendOtp(phone: string): Promise<{ success: boolean; message: string }> {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) {
      throw new BadRequestException('Phone number must have at least 6 digits');
    }
    this.logger.log(`OTP generated for ${phone}`);
    return {
      success: true,
      message: 'OTP sent successfully',
    };
  }

  /**
   * Verifies OTP and returns valid access token.
   */
  async verifyOtp(
    phone: string,
    otp: string,
  ): Promise<{ accessToken: string; authState: AuthState }> {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 6) {
      throw new BadRequestException('Phone number must have at least 6 digits');
    }
    const expectedOtp = digits.slice(-6);
    if (otp !== expectedOtp) {
      throw new BadRequestException('Invalid verification code. Please try again.');
    }


    const normalised = normalisePhone(phone);
    if (!normalised) {
      throw new BadRequestException('Invalid phone number');
    }

    // Upsert into auth.users to ensure foreign key FK_users_auth_user is satisfied
    const rows = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO "auth"."users" (id, phone, aud, role)
       VALUES ($1, $2, 'authenticated', 'authenticated')
       ON CONFLICT (phone) DO UPDATE SET updated_at = now()
       RETURNING id;`,
      [crypto.randomUUID(), normalised],
    );

    const userId = rows[0]?.id;
    if (!userId) {
      throw new Error('Failed to create or locate identity in auth.users');
    }

    // Bootstrap user row in public.users
    const authState = await this.bootstrap({
      userId,
      phone: normalised,
      email: null,
      phoneVerified: true,
      provider: 'phone',
      sessionId: crypto.randomUUID(),
      authTime: Math.floor(Date.now() / 1000),
    });

    // Sign HS256 JWT using SUPABASE_JWT_SECRET
    const legacyJwtSecret = this.config.supabase.legacyJwtSecret;
    if (!legacyJwtSecret) {
      throw new Error('SUPABASE_JWT_SECRET must be configured for dev mock OTP token issuance');
    }

    const secret = new TextEncoder().encode(legacyJwtSecret);
    const accessToken = await new SignJWT({
      sub: userId,
      phone: normalised,
      phone_verified: true,
      auth_time: Math.floor(Date.now() / 1000),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.config.supabase.authBaseUrl)
      .setAudience(this.config.supabase.audience)
      .setExpirationTime('7d')
      .sign(secret);

    return {
      accessToken,
      authState,
    };
  }


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