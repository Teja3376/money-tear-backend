import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class PinStatusDto {
  @ApiProperty({ description: 'Whether a PIN has been set for this account' })
  @IsBoolean()
  configured!: boolean;

  @ApiPropertyOptional({
    description: 'ISO timestamp of the last PIN change (no lockout counters are exposed)',
  })
  @IsOptional()
  @IsISO8601()
  updatedAt!: string | null;
}
