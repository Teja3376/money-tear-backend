import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { AuthenticatedUser } from '@/modules/auth/services/supabase-jwt.verifier';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
