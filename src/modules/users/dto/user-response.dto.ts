import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ACCOUNT_STATUSES } from '@/common/constants/account';

export class UserResponseDto {
  @ApiProperty({ description: 'Application user id (matches the Supabase Auth user id)' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ description: 'Normalised phone number, when linked' })
  @IsOptional()
  @IsString()
  phone!: string | null;

  @ApiPropertyOptional({ description: 'Email address, when provided' })
  @IsOptional()
  @IsString()
  email!: string | null;

  @ApiPropertyOptional({ description: 'Given name' })
  @IsOptional()
  @IsString()
  firstName!: string | null;

  @ApiPropertyOptional({ description: 'Family name' })
  @IsOptional()
  @IsString()
  lastName!: string | null;

  @ApiPropertyOptional({ description: 'Date of birth as YYYY-MM-DD (PostgreSQL DATE)' })
  @IsOptional()
  @IsString()
  dateOfBirth!: string | null;

  @ApiProperty({ description: 'Application role' })
  @IsString()
  role!: string;

  @ApiProperty({ enum: ACCOUNT_STATUSES, description: 'Account status' })
  @IsIn(ACCOUNT_STATUSES as unknown as string[])
  status!: string;

  @ApiPropertyOptional({ description: 'ISO timestamp at which onboarding finished' })
  @IsOptional()
  @IsString()
  onboardingCompletedAt!: string | null;

  @ApiProperty({ description: 'ISO timestamp of creation' })
  @IsString()
  createdAt!: string;

  @ApiProperty({ description: 'ISO timestamp of the last update' })
  @IsString()
  updatedAt!: string;
}

export type UserResponse = InstanceType<typeof UserResponseDto>;

export function isProfileComplete(user: {
  firstName: string | null;
  lastName: string | null;
  dateOfBirth: string | null;
}): boolean {
  return Boolean(user.firstName && user.lastName && user.dateOfBirth);
}
