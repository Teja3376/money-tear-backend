import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ThrottleSecuritySensitive } from '@/common/decorators/throttle-security-sensitive.decorator';
import { ApiErrorDto } from '@/common/dto/api-error.dto';
import { RecentAuthGuard } from '@/common/guards/recent-auth.guard';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';
import {
  ChangePinDto,
  PinMutationResultDto,
  PinStatusDto,
  PinVerifiedDto,
  SetupPinDto,
  VerifyPinDto,
} from '@/modules/security/dto/pin.dto';
import { SecurityService } from '@/modules/security/security.service';

@ApiTags('security')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid Supabase access token',
  type: ApiErrorDto,
})
@Controller('security/pin')
export class SecurityController {
  constructor(private readonly securityService: SecurityService) {}

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RecentAuthGuard)
  @ThrottleSecuritySensitive()
  @ApiOperation({
    summary: 'Set the application PIN',
    description:
      'Stores the first 4-digit PIN as an Argon2id hash. Requires recent authentication ' +
      '(see the recent-auth policy) and refuses to overwrite an existing PIN - use ' +
      '`/change` or `/reset` instead. The hash is never returned.',
  })
  @ApiCreatedResponse({ description: 'PIN configured', type: PinMutationResultDto })
  @ApiForbiddenResponse({
    description: 'Recent authentication required',
    type: ApiErrorDto,
  })
  @ApiConflictResponse({
    description: 'A PIN is already configured',
    type: ApiErrorDto,
  })
  async setup(
    @CurrentUser() identity: AuthenticatedUser,
    @Body() input: SetupPinDto,
    @Req() request: Request,
  ) {
    return this.securityService.setupPin(identity.userId, input, request);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ThrottleSecuritySensitive()
  @ApiOperation({
    summary: 'Verify the application PIN',
    description:
      'Verifies the PIN against the stored Argon2id hash and, on success, opens a ' +
      'short-lived PIN-unlock state held **on the server**. Failed attempts are ' +
      'counted per user and lock the PIN temporarily; per-IP throttling applies on ' +
      'top. Errors are intentionally generic so the endpoint cannot be used to ' +
      'enumerate state.',
  })
  @ApiOkResponse({ description: 'PIN verified', type: PinVerifiedDto })
  @ApiConflictResponse({ description: 'No PIN configured', type: ApiErrorDto })
  @ApiTooManyRequestsResponse({
    description: 'PIN locked after too many failed attempts, or throttled',
    type: ApiErrorDto,
  })
  async verify(
    @CurrentUser() identity: AuthenticatedUser,
    @Body() input: VerifyPinDto,
    @Req() request: Request,
  ) {
    const outcome = await this.securityService.verifyPin(identity.userId, input.pin, request);
    return {
      verified: outcome.verified,
      unlockedUntil: outcome.unlockedUntil?.toISOString() ?? null,
    };
  }

  @Post('change')
  @HttpCode(HttpStatus.OK)
  @ThrottleSecuritySensitive()
  @ApiOperation({
    summary: 'Change the application PIN',
    description:
      'Requires the current PIN, rejects a new PIN identical to the current one, and ' +
      'records an audit event. Any PIN-unlock state is revoked, so the new PIN must be ' +
      'verified again.',
  })
  @ApiOkResponse({ description: 'PIN changed', type: PinMutationResultDto })
  @ApiConflictResponse({
    description: 'No PIN configured, or the new PIN matches the current one',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({
    description: 'Locked out after too many failed attempts, or throttled',
    type: ApiErrorDto,
  })
  async change(
    @CurrentUser() identity: AuthenticatedUser,
    @Body() input: ChangePinDto,
    @Req() request: Request,
  ) {
    return this.securityService.changePin(identity.userId, input, request);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RecentAuthGuard)
  @ThrottleSecuritySensitive()
  @ApiOperation({
    summary: 'Reset the application PIN',
    description:
      'Clears the configured PIN so a new one can be set. Requires renewed identity ' +
      'verification: a valid access token that also satisfies the recent-auth policy. ' +
      'A user id, phone number or email is never accepted as proof of identity. Any ' +
      'PIN-unlock state is revoked.',
  })
  @ApiOkResponse({ description: 'PIN cleared', type: PinMutationResultDto })
  @ApiForbiddenResponse({
    description: 'Recent authentication required',
    type: ApiErrorDto,
  })
  @ApiTooManyRequestsResponse({ description: 'Throttled', type: ApiErrorDto })
  async reset(@CurrentUser() identity: AuthenticatedUser, @Req() request: Request) {
    return this.securityService.resetPin(identity.userId, request);
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'PIN configuration status',
    description:
      'Returns only whether a PIN is configured. Hashes, attempt counters and lockout ' +
      'state are never exposed.',
  })
  @ApiOkResponse({ description: 'PIN status', type: PinStatusDto })
  async status(@CurrentUser() identity: AuthenticatedUser) {
    return this.securityService.getStatus(identity.userId);
  }
}