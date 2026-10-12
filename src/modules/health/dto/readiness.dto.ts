import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, ValidateNested } from 'class-validator';

export class DatabaseHealthDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  status!: 'up' | 'down';

  @ApiPropertyOptional({ description: 'Present only when the database check failed' })
  @IsString()
  error?: string;
}

export class ReadinessDto {
  @ApiProperty({ enum: ['ok', 'degraded'], description: '"degraded" when the database is unreachable' })
  @IsIn(['ok', 'degraded'])
  status!: 'ok' | 'degraded';

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  uptimeSeconds!: number;

  @ApiProperty()
  @Type(() => DatabaseHealthDto)
  @ValidateNested()
  database!: DatabaseHealthDto;
}
