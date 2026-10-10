import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  database: {
    status: 'up' | 'down';
    /** Only set when the check fails; never contains credentials or a driver stack. */
    error?: string;
  };
}

/**
 * Health checks that distinguish *application availability* from *database
 * connectivity*: the process can be alive and serving `/health/live` while the
 * database is unreachable, which is what `/health/ready` reports.
 */
@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Liveness: the process is running. Deliberately does not touch the database. */
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

  /** Readiness: the database answers a trivial query. */
  async ready(): Promise<HealthReport> {
    const uptimeSeconds = Math.round(process.uptime());
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', uptimeSeconds, database: { status: 'up' } };
    } catch (error) {
      return {
        status: 'degraded',
        uptimeSeconds,
        database: {
          status: 'down',
          // Message only - no stack, no connection string, no credentials.
          error: error instanceof Error ? error.message : 'Unknown database error',
        },
      };
    }
  }
}