import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString } from 'class-validator';

export class LivenessDto {
  @ApiProperty({ description: 'Health status', example: 'healthy' })
  @IsString()
  status!: string;

  @ApiProperty({ description: 'Human-readable health message', example: 'MoneyTear backend is running and working properly' })
  @IsString()
  message!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp of the probe', example: '2026-10-13T02:10:00.000Z' })
  @IsString()
  timestamp!: string;

  @ApiProperty({ description: 'Seconds since process start', example: 120 })
  @Type(() => Number)
  @IsInt()
  uptimeSeconds!: number;

  @ApiProperty({ description: 'Human-readable formatted uptime', example: '2m 0s' })
  @IsString()
  uptime!: string;
}
