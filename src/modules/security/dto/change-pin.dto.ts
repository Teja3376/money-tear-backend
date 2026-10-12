import { ApiProperty } from '@nestjs/swagger';
import { IsString, Validate } from 'class-validator';
import { pin, MatchesField } from '@/modules/security/dto/pin-validators';

export class ChangePinDto {
  @ApiProperty({ description: 'The PIN currently configured' })
  @IsString()
  @pin()
  currentPin!: string;

  @ApiProperty({ description: 'The replacement PIN' })
  @IsString()
  @pin()
  newPin!: string;

  @ApiProperty({ description: 'Must match "newPin"' })
  @IsString()
  @pin()
  @Validate(MatchesField, ['newPin'])
  confirmNewPin!: string;
}

export type ChangePinInput = InstanceType<typeof ChangePinDto>;
