import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthAuditEvent } from '@/modules/audit/entities/auth-audit-event.entity';
import { AuditService } from '@/modules/audit/services/audit.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuthAuditEvent])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
