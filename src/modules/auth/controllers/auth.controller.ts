import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { ApiErrorDto } from '@/common/dto/api-error.dto';
import { AuthService } from '@/modules/auth/services/auth.service';
import type { AuthenticatedUser } from '@/modules/auth/services/supabase-jwt.verifier';
import { AuthStateDto } from '@/modules/auth/dto/auth-state.dto';
import { LogoutResultDto } from '@/modules/auth/dto/logout-result.dto';
import { SendOtpDto } from '@/modules/auth/dto/send-otp.dto';
import { SendOtpResultDto } from '@/modules/auth/dto/send-otp-result.dto';
import { VerifyOtpDto } from '@/modules/auth/dto/verify-otp.dto';
import { VerifyOtpResultDto } from '@/modules/auth/dto/verify-otp-result.dto';

@ApiTags('auth')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid Supabase access token',
  type: ApiErrorDto,
})
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send verification OTP',
    description: 'Generates and dispatches a 6-digit verification code to the phone number.',
  })
  @ApiOkResponse({ description: 'OTP sent result', type: SendOtpResultDto })
  async sendOtp(@Body() body: SendOtpDto) {
    return this.authService.sendOtp(body.phone);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP and issue access token',
    description: 'Verifies the 6-digit OTP and returns a valid access token.',
  })
  @ApiOkResponse({ description: 'Verification successful', type: VerifyOtpResultDto })
  async verifyOtp(@Body() body: VerifyOtpDto) {
    return this.authService.verifyOtp(body.phone, body.otp);
  }




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
