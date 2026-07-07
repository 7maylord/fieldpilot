import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { Public } from '../auth/auth.decorators';
import { MetricsService } from './metrics.service';

class ClientFailureDto {
  @IsIn(['crash', 'sync', 'storage', 'service_worker', 'network'])
  kind!: string;
}

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async scrape() {
    return this.metrics.render();
  }

  @Post('client-failures')
  clientFailure(@Body() body: ClientFailureDto) {
    this.metrics.clientFailures.inc({ kind: body.kind });
    return { accepted: true };
  }
}
