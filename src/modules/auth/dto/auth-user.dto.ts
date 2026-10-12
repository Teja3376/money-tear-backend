import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ACCOUNT_STATUSES } from '@/common/constants/account';

export class AuthUserDto {
  @ApiProperty({ description: 'Application user id (matches the Supabase Auth user id)' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ description: 'Normalised phone number from the verified token' })
  @IsOptional()
  @IsString()
  phone!: string | null;

  @ApiPropertyOptional({ description: 'Email from the verified token, when present' })
  @IsOptional()
  @IsString()
  email!: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName!: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName!: string | null;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  dateOfBirth!: string | null;

  @ApiProperty({ description: 'Application role' })
  @IsString()
  role!: string;

  @ApiProperty({ enum: ACCOUNT_STATUSES, description: 'active, suspended or disabled' })
  @IsIn(ACCOUNT_STATUSES as unknown as string[])
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  onboardingCompletedAt!: string | null;

  @ApiProperty()
  @IsString()
  createdAt!: string;

  @ApiProperty()
  @IsString()
  updatedAt!: string;
}
