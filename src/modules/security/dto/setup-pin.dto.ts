import { ApiProperty } from '@nestjs/swagger';
import { IsString, Validate } from 'class-validator';
import { pin, MatchesField } from '@/modules/security/dto/pin-validators';

export class SetupPinDto {
  @ApiProperty({ description: 'The 4-digit PIN to set' })
  @IsString()
  @pin()
  pin!: string;

  @ApiProperty({ description: 'Must match "pin"' })
  @IsString()
  @pin()
  @Validate(MatchesField, ['pin'])
  confirmPin!: string;
}

export type SetupPinInput = InstanceType<typeof SetupPinDto>;
