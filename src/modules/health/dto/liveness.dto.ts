import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString } from 'class-validator';

export class LivenessDto {
  @ApiProperty({ description: 'Process is running' })
  @IsString()
  status!: 'ok';

  @ApiProperty({ description: 'Seconds since process start' })
  @Type(() => Number)
  @IsInt()
  uptimeSeconds!: number;
}
