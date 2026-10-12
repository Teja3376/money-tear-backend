import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsString } from 'class-validator';

export class ApiErrorDto {
  @ApiProperty({ description: 'HTTP status code' })
  @Type(() => Number)
  @IsInt()
  statusCode!: number;

  @ApiProperty({ description: 'Short machine-readable error code' })
  @IsString()
  error!: string;

  @ApiProperty({ description: 'Human-readable summary safe to return to a client' })
  @IsString()
  message!: string;

  @ApiProperty({ description: 'Correlation id, also present in server logs' })
  @IsString()
  requestId!: string;

  @ApiProperty({ description: 'Request path that failed' })
  @IsString()
  path!: string;

  @ApiProperty({ description: 'ISO-8601 time the error was produced' })
  @IsString()
  timestamp!: string;

  @ApiPropertyOptional({ description: 'Per-field validation messages, when applicable' })
  @IsObject()
  @IsArray()
  @IsString({ each: true })
  errors?: Record<string, string[]>;
}

export type ApiError = InstanceType<typeof ApiErrorDto>;
