import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ACCOUNT_STATUS } from '@/common/constants/account';
import type { AuthenticatedUser } from '@/modules/auth/services/supabase-jwt.verifier';
import { UsersService } from '@/modules/users/services/users.service';

@Injectable()
export class AccountStatusGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const identity = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;

    // Public or unauthenticated routes never reach the API surface, so there is
    // nothing to authorise.
    if (!identity) {
      return true;
    }

    const status = await this.usersService.findStatus(identity.userId);
    if (status === null || status === ACCOUNT_STATUS.ACTIVE) {
      return true;
    }

    throw new ForbiddenException(
      `Account is ${status}. Contact support to restore access.`,
    );
  }
}
