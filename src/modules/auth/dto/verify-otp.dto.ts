import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ description: 'User phone number' })
  @IsString()
  @MinLength(10)
  phone!: string;

  @ApiProperty({ description: '6-digit verification code' })
  @IsString()
  @MinLength(6)
  otp!: string;
}
