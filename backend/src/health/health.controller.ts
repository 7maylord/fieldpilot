import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: QueueService,
  ) {}

  @Public()
  @Get()
  check() {
    return { status: 'ok' } as const;
  }

  @Public()
  @Get('ready')
  async readiness() {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.queues.ping();
    return { status: 'ready' } as const;
  }
}
