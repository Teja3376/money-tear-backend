import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface HealthReport {
  status: 'healthy' | 'degraded';
  message: string;
  timestamp: string;
  uptimeSeconds: number;
  uptime: string;
  database: {
    status: 'connected' | 'disconnected';
    message: string;
    timestamp: string;
    host?: string;
    error?: string;
  };
}

export interface LivenessReport {
  status: 'healthy';
  message: string;
  timestamp: string;
  uptimeSeconds: number;
  uptime: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

@Injectable()
export class HealthService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  live(): LivenessReport {
    const uptimeSeconds = Math.round(process.uptime());
    return {
      status: 'healthy',
      message: 'MoneyTear backend is running and working properly',
      timestamp: new Date().toISOString(),
      uptimeSeconds,
      uptime: formatUptime(uptimeSeconds),
    };
  }

  async ready(): Promise<HealthReport> {
    const uptimeSeconds = Math.round(process.uptime());
    const timestamp = new Date().toISOString();
    const dbHost = (this.dataSource.options as any)?.host;

    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'healthy',
        message: 'MoneyTear backend and database are connected and working without issue',
        timestamp,
        uptimeSeconds,
        uptime: formatUptime(uptimeSeconds),
        database: {
          status: 'connected',
          message: 'Database connection is successful and working without issue',
          timestamp,
          host: dbHost,
        },
      };
    } catch (error) {
      return {
        status: 'degraded',
        message: 'Backend is running, but database connection encountered an issue',
        timestamp,
        uptimeSeconds,
        uptime: formatUptime(uptimeSeconds),
        database: {
          status: 'disconnected',
          message: 'Database connection failed',
          timestamp,
          host: dbHost,
          error: error instanceof Error ? error.message : 'Unknown database error',
        },
      };
    }
  }
}
