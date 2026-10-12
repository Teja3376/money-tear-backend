import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class PinMutationResultDto {
  @ApiProperty({ description: 'Whether the operation completed' })
  @IsBoolean()
  success!: boolean;

  @ApiProperty({ description: 'Whether a PIN is configured after the operation' })
  @IsBoolean()
  configured!: boolean;
}
