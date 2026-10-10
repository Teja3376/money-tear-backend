import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';

/**
 * Injects the identity produced by `JwtAuthGuard`.
 *
 * Controllers depend on this decorator instead of reading `request.user`, so the
 * authenticated identity always comes from a verified token.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);