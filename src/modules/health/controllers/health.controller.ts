import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { HealthService } from '@/modules/health/services/health.service';
import { LivenessDto } from '@/modules/health/dto/liveness.dto';
import { ReadinessDto } from '@/modules/health/dto/readiness.dto';

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Reports that the process is running. Does not touch the database.',
  })
  @ApiOkResponse({ description: 'Process is alive', type: LivenessDto })
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Verifies database connectivity. Returns "degraded" with HTTP 200 when the database ' +
      'is unreachable, so a monitoring system can distinguish application availability ' +
      'from database health.',
  })
  @ApiOkResponse({ description: 'Readiness report', type: ReadinessDto })
  ready() {
    return this.healthService.ready();
  }
}
