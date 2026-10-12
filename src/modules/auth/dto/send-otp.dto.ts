import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({ description: 'User phone number' })
  @IsString()
  @MinLength(10)
  phone!: string;
}
