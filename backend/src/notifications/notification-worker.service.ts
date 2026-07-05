import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Worker } from 'bullmq';
import { QueueService } from '../queue/queue.service';
import { NotificationsService } from './notifications.service';

@Injectable()
export class NotificationWorker implements OnModuleDestroy {
  private worker?: Worker;

  constructor(
    private readonly queues: QueueService,
    private readonly notifications: NotificationsService,
  ) {}

  start() {
    this.worker ??= this.queues.startWorker<Record<string, unknown>>(
      'notifications',
      async (job) =>
        this.notifications.deliver(job.name, job.data, String(job.id)),
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
