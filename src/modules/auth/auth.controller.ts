import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiErrorDto } from '@/common/dto/api-error.dto';
import { AuthService } from '@/modules/auth/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';
import { AuthStateDto, LogoutResultDto } from '@/modules/auth/dto/auth.dto';

@ApiTags('auth')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid Supabase access token',
  type: ApiErrorDto,
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('bootstrap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create or retrieve the application user',
    description:
      'Idempotently provisions the application record for the caller and returns profile ' +
      'completeness, PIN configuration status and account status. The identity is taken ' +
      'from the verified access token - no user id is accepted from the request body, and ' +
      'concurrent calls converge on a single row.',
  })
  @ApiOkResponse({ description: 'Current authentication state', type: AuthStateDto })
  async bootstrap(@CurrentUser() identity: AuthenticatedUser, @Req() request: Request) {
    return this.authService.bootstrap(identity, request);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the authenticated user',
    description:
      'Returns the authenticated application user with profile completeness, PIN ' +
      'configuration status and account status. Internal hashes and security counters ' +
      'are never exposed. Bootstraps automatically when the record is missing.',
  })
  @ApiOkResponse({ description: 'Current authentication state', type: AuthStateDto })
  async me(@CurrentUser() identity: AuthenticatedUser) {
    return this.authService.me(identity);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End the current session',
    description:
      'Records an audited logout. This call does not clear credentials held by the client ' +
      '(the mobile app must dispose of its own access and refresh tokens) and does not ' +
      'revoke Supabase refresh tokens server-side in this phase. The returned "scope" ' +
      'field states exactly what was done.',
  })
  @ApiOkResponse({ description: 'Logout acknowledged', type: LogoutResultDto })
  async logout(@CurrentUser() identity: AuthenticatedUser, @Req() request: Request) {
    return this.authService.logout(identity, request);
  }
}