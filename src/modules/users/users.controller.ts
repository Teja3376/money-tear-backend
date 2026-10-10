import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiErrorDto } from '@/common/dto/api-error.dto';
import { AuditService } from '@/modules/audit/audit.service';
import { AUDIT_EVENT } from '@/common/constants/audit-event';
import {
  UpdateProfileDto,
  UserResponseDto,
  type UserResponse,
} from '@/modules/users/dto/user.dto';
import { UsersService, toUserResponse } from '@/modules/users/users.service';
import type { AuthenticatedUser } from '@/modules/auth/supabase-jwt.verifier';

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
  description: 'Missing or invalid Supabase access token',
  type: ApiErrorDto,
})
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get the current user profile',
    description:
      'Returns the profile of the caller. Ownership is derived from the verified access token; the user id cannot be supplied by the client.',
  })
  @ApiOkResponse({ description: 'Current profile', type: UserResponseDto })
  @ApiNotFoundResponse({
    description: 'Profile has not been bootstrapped yet',
    type: ApiErrorDto,
  })
  async getMe(@CurrentUser() identity: AuthenticatedUser): Promise<UserResponse> {
    const user = await this.usersService.findById(identity.userId);
    if (!user) {
      throw new NotFoundException('Profile not initialised. Call POST /api/auth/bootstrap first.');
    }
    return toUserResponse(user);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update the current user profile',
    description:
      'Updates an allowlisted set of fields (firstName, lastName, email, dateOfBirth). ' +
      'Role, account status and identifiers are server-owned and rejected by validation.',
  })
  @ApiOkResponse({ description: 'Updated profile', type: UserResponseDto })
  @ApiConflictResponse({ description: 'Profile not initialised', type: ApiErrorDto })
  async updateMe(
    @CurrentUser() identity: AuthenticatedUser,
    @Body() input: UpdateProfileDto,
  ): Promise<UserResponse> {
    const existing = await this.usersService.findById(identity.userId);
    if (!existing) {
      throw new NotFoundException('Profile not initialised. Call POST /api/auth/bootstrap first.');
    }

    const updated = await this.usersService.updateProfile(identity.userId, input);
    await this.auditService.record({
      eventType: AUDIT_EVENT.PROFILE_UPDATED,
      success: true,
      userId: identity.userId,
      metadata: { profileFields: Object.keys(input).join(','), source: 'user' },
    });
    return updated;
  }
}