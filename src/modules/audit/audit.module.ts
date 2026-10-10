import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthAuditEvent } from '@/modules/audit/entities/auth-audit-event.entity';
import { AuditService } from '@/modules/audit/audit.service';

/**
 * Global so any module can record a security event without re-importing it.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuthAuditEvent])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}