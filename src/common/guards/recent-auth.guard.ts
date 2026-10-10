import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getAppConfig } from '@/config/configuration';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';

/**
 * Step-up authentication policy ("recent authentication").
 *
 * Sensitive operations - setting or resetting the application PIN - require the
 * caller to have authenticated *recently*, not merely to hold a long-lived access
 * token. The check uses Supabase's `auth_time` claim, which records when the
 * underlying sign-in actually happened.
 *
 * Limitation (documented in AUTH_BACKEND_PLAN.md): the freshness value is supplied
 * by Supabase and is carried over across token refreshes, so the effective window
 * is bounded below by what the identity provider reports.
 */
@Injectable()
export class RecentAuthGuard implements CanActivate {
  private readonly windowSeconds: number;

  constructor(configService: ConfigService) {
    this.windowSeconds = getAppConfig(configService).auth.recentAuthWindowSeconds;
  }

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;

    if (!user) {
      // Guard ordering bug rather than a client error.
      throw new UnauthorizedException('Authentication required');
    }

    if (user.authTime === null) {
      throw new ForbiddenException(
        'Recent authentication is required. Sign in again to continue.',
      );
    }

    const ageSeconds = Math.floor(Date.now() / 1000) - user.authTime;
    if (ageSeconds > this.windowSeconds) {
      throw new ForbiddenException(
        'Recent authentication is required. Sign in again to continue.',
      );
    }

    return true;
  }
}