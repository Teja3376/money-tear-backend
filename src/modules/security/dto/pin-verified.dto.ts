import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

export class PinVerifiedDto {
  @ApiProperty({ description: 'True only when the supplied PIN matched' })
  @IsBoolean()
  verified!: boolean;

  @ApiPropertyOptional({
    description:
      'Server-side PIN-unlock expiry. This reflects state held by the API, not a client-side flag.',
  })
  @IsOptional()
  @IsISO8601()
  unlockedUntil!: string | null;
}
