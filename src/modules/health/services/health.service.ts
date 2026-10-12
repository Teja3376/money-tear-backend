import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface HealthReport {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  database: {
    status: 'up' | 'down';
    error?: string;
  };
}

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  }

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
