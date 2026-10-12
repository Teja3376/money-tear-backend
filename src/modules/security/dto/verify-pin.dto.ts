import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { pin } from '@/modules/security/dto/pin-validators';

export class VerifyPinDto {
  @ApiProperty({ description: 'The PIN to verify' })
  @IsString()
  @pin()
  pin!: string;
}

export type VerifyPinInput = InstanceType<typeof VerifyPinDto>;
