import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

export class LogoutResultDto {
  @ApiProperty({ description: 'The session was acknowledged and recorded' })
  @IsBoolean()
  loggedOut!: boolean;

  @ApiProperty({
    description:
      'Server-side effect of this call. Client-side token disposal is the client responsibility.',
  })
  @IsString()
  scope!: string;
}
