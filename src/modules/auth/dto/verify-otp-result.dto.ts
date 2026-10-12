import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsString } from 'class-validator';
import { AuthStateDto } from '@/modules/auth/dto/auth-state.dto';

export class VerifyOtpResultDto {
  @ApiProperty({ description: 'JWT access token to authenticate subsequent requests' })
  @IsString()
  accessToken!: string;

  @ApiProperty({ description: 'Application auth state' })
  @Type(() => AuthStateDto)
  authState!: AuthStateDto;
}
