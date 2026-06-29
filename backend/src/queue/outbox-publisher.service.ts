import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantDatabase } from '../database/tenant-database.service';
import { QueueService } from './queue.service';

@Injectable()
export class OutboxPublisher implements OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantDatabase,
    private readonly queues: QueueService,
  ) {}

  start(intervalMs = 1_000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.publishBatch(), intervalMs);
    this.timer.unref();
  }

  async publishBatch() {
    const identityEvents = await this.prisma.identityOutboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const event of identityEvents) {
      await this.queues.add(
        'notifications',
        event.eventType,
        event.payload as object,
        event.id,
      );
      await this.prisma.identityOutboxEvent.update({
        where: { id: event.id },
        data: { publishedAt: new Date() },
      });
    }

    const organizations = await this.prisma.$queryRaw<
      { organization_id: string }[]
    >`
      SELECT organization_id FROM app_pending_outbox_organizations()
    `;
    for (const { organization_id: organizationId } of organizations) {
      await this.tenants.withTenant(
        { organizationId, userId: organizationId },
        async (tx) => {
          const events = await tx.outboxEvent.findMany({
            where: { organizationId, publishedAt: null },
            orderBy: { createdAt: 'asc' },
            take: 100,
          });
          for (const event of events) {
            await this.queues.add(
              'notifications',
              event.eventType,
              { organizationId, ...asObject(event.payload) },
              event.id,
            );
            await tx.outboxEvent.update({
              where: { id: event.id },
              data: { publishedAt: new Date() },
            });
          }
        },
      );
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}

function asObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : { value };
}
