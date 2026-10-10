import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserSecurity } from '@/modules/security/entities/user-security.entity';
import { PinHasher } from '@/modules/security/pin-hasher.service';
import { PinUnlockService } from '@/modules/security/pin-unlock.service';
import { SecurityController } from '@/modules/security/security.controller';
import { SecurityService } from '@/modules/security/security.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserSecurity])],
  controllers: [SecurityController],
  providers: [SecurityService, PinHasher, PinUnlockService],
  exports: [SecurityService, PinHasher, PinUnlockService],
})
export class SecurityModule {}