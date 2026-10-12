import { Global, Module } from '@nestjs/common';
import { RecentAuthGuard } from '@/common/guards/recent-auth.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { SupabaseJwtVerifier } from '@/modules/auth/services/supabase-jwt.verifier';

@Global()
@Module({
  providers: [SupabaseJwtVerifier, JwtAuthGuard, RecentAuthGuard],
  exports: [SupabaseJwtVerifier, JwtAuthGuard, RecentAuthGuard],
})
export class AuthCoreModule {}
