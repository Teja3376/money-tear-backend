import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';

export class DatabaseHealthDto {
  @ApiProperty({ description: 'Database status', example: 'connected' })
  @IsString()
  status!: string;

  @ApiProperty({ description: 'Human-readable database status message', example: 'Database connection is successful and working without issue' })
  @IsString()
  message!: string;

  @ApiProperty({ description: 'ISO 8601 timestamp of database check', example: '2026-10-13T02:10:00.000Z' })
  @IsString()
  timestamp!: string;

  @ApiPropertyOptional({ description: 'Configured database host', example: 'aws-0-ap-northeast-1.pooler.supabase.com' })
  @IsOptional()
  @IsString()
  host?: string;

  @ApiPropertyOptional({ description: 'Present only when the database check failed' })
  @IsOptional()
  @IsString()
  error?: string;
}

export class ReadinessDto {
  @ApiProperty({ description: 'Overall system readiness status', example: 'healthy' })
  @IsString()
  status!: string;

  @ApiProperty({ description: 'Human-readable system status message', example: 'MoneyTear backend and database are connected and working without issue' })
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

  @ApiProperty({ type: () => DatabaseHealthDto })
  @Type(() => DatabaseHealthDto)
  @ValidateNested()
  database!: DatabaseHealthDto;
}
