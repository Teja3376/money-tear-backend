import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { AppService } from '@/app.service';
import { Public } from '@/common/decorators/public.decorator';

/**
 * Root metadata route, served at `/api`.
 *
 * Retains the original scaffold endpoint's role (a cheap "is it up" response)
 * without colliding with the API surface.
 */
@Public()
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiExcludeEndpoint()
  getHello(): string {
    return this.appService.getHello();
  }
}