import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ACCOUNT_STATUSES } from '@/common/constants/account';
import { AuthUserDto } from '@/modules/auth/dto/auth-user.dto';

export class AuthStateDto {
  @ApiProperty({ description: 'The authenticated application user' })
  @Type(() => AuthUserDto)
  user!: AuthUserDto;

  @ApiProperty({
    description: 'True when firstName, lastName and dateOfBirth are all set',
  })
  @IsBoolean()
  profileComplete!: boolean;

  @ApiProperty({ description: 'Whether an application PIN has been set' })
  @IsBoolean()
  pinConfigured!: boolean;

  @ApiProperty({ enum: ACCOUNT_STATUSES, description: 'Current account status' })
  @IsIn(ACCOUNT_STATUSES as unknown as string[])
  accountStatus!: string;

  @ApiPropertyOptional({
    description: 'Bootstrap only: true when a new row was created',
  })
  @IsOptional()
  @IsBoolean()
  created?: boolean;
}
