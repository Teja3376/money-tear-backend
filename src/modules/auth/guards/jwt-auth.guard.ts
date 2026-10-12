import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@/modules/auth/services/supabase-jwt.verifier';
import { SupabaseJwtVerifier } from '@/modules/auth/services/supabase-jwt.verifier';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly verifier: SupabaseJwtVerifier,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = await this.verifier.verifyAuthorizationHeader(request.headers.authorization);
    request.user = user;
    return true;
  }
}
