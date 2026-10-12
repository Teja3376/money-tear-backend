import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

export class SendOtpResultDto {
  @ApiProperty()
  @IsBoolean()
  success!: boolean;

  @ApiProperty()
  @IsString()
  message!: string;
}
