import { Global, Module } from '@nestjs/common';
import { RecentAuthGuard } from '@/common/guards/recent-auth.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { SupabaseJwtVerifier } from '@/modules/auth/supabase-jwt.verifier';

/**
 * Global so the token verifier and the guards that depend on it are resolvable
 * from every feature module.
 *
 * Kept separate from `AuthModule` so `UsersModule` and `SecurityModule` can use
 * `JwtAuthGuard` without importing `AuthModule` (which depends on them) and
 * creating a circular module dependency.
 */
@Global()
@Module({
  providers: [SupabaseJwtVerifier, JwtAuthGuard, RecentAuthGuard],
  exports: [SupabaseJwtVerifier, JwtAuthGuard, RecentAuthGuard],
})
export class AuthCoreModule {}