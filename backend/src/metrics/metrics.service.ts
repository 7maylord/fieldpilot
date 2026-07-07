import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { PrismaService } from '../database/prisma.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  readonly http = new Histogram({
    name: 'fieldpilot_http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.05, 0.1, 0.25, 0.5, 0.8, 1, 2, 5],
    registers: [this.registry],
  });
  readonly dependencies = new Gauge({
    name: 'fieldpilot_dependency_up',
    help: 'Dependency readiness',
    labelNames: ['dependency'],
    registers: [this.registry],
  });
  readonly queues = new Gauge({
    name: 'fieldpilot_queue_jobs',
    help: 'Queue jobs by state',
    labelNames: ['queue', 'state'],
    registers: [this.registry],
  });
  readonly domain = new Counter({
    name: 'fieldpilot_domain_events_total',
    help: 'Operational domain outcomes',
    labelNames: ['area', 'outcome'],
    registers: [this.registry],
  });
  readonly sseConnections = new Gauge({
    name: 'fieldpilot_sse_connections',
    help: 'Active SSE connections',
    registers: [this.registry],
  });
  readonly clientFailures = new Counter({
    name: 'fieldpilot_client_failures_total',
    help: 'Reported client failures',
    labelNames: ['kind'],
    registers: [this.registry],
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: 'fieldpilot_' });
  }

  async render() {
    await Promise.all([this.collectDatabase(), this.collectQueues()]);
    return this.registry.metrics();
  }

  contentType() {
    return this.registry.contentType;
  }

  private async collectDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.dependencies.set({ dependency: 'postgres' }, 1);
    } catch {
      this.dependencies.set({ dependency: 'postgres' }, 0);
    }
    try {
      await this.queueService.ping();
      this.dependencies.set({ dependency: 'redis' }, 1);
    } catch {
      this.dependencies.set({ dependency: 'redis' }, 0);
    }
  }

  private async collectQueues() {
    try {
      const queues = (await this.queueService.metrics()) as Record<
        string,
        Record<string, number | undefined>
      >;
      for (const [queue, states] of Object.entries(queues))
        for (const [state, count] of Object.entries(states))
          this.queues.set({ queue, state }, count ?? 0);
    } catch {
      this.domain.inc({ area: 'queues', outcome: 'metrics_failed' });
    }
  }
}
