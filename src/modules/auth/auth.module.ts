import { Module } from '@nestjs/common';
import { AuthCoreModule } from '@/modules/auth/auth-core.module';
import { AuthController } from '@/modules/auth/controllers/auth.controller';
import { AuthService } from '@/modules/auth/services/auth.service';
import { SecurityModule } from '@/modules/security/security.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [AuthCoreModule, UsersModule, SecurityModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
