import { SetMetadata } from '@nestjs/common';

/** Metadata key read by `JwtAuthGuard`. */
export const IS_PUBLIC_KEY = 'moneytear:isPublic';

/**
 * Marks a route as reachable without a Supabase access token.
 *
 * Authentication is enforced globally, so a new controller is protected by
 * default and an endpoint is only exposed when it is *explicitly* marked public.
 * That inverts the failure mode: forgetting a guard can no longer silently leave
 * an endpoint open.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);