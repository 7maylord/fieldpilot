import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Job, Queue, Worker, type Processor } from 'bullmq';
import IORedis from 'ioredis';
import { newId } from '../common/id';
import { loadConfig } from '../config/app.config';
import {
  TenantDatabase,
  type TenantContext,
} from '../database/tenant-database.service';

export const queueNames = [
  'notifications',
  'media-processing',
  'report-generation',
  'recurring-work',
  'sync-maintenance',
  'exports',
  'data-retention',
  'audit-archive',
] as const;

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly redisUrl = loadConfig().redisUrl;
  private readonly tenantRateLimit = Number(
    process.env.QUEUE_TENANT_RATE_PER_MINUTE ?? 100,
  );
  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  private redis?: IORedis;

  constructor(private readonly tenants: TenantDatabase) {}

  async add<T extends object>(
    queueName: (typeof queueNames)[number],
    jobName: string,
    data: T,
    jobId: string,
  ) {
    return this.queue(queueName).add(jobName, data, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }

  startWorker<T extends { organizationId?: string }>(
    queueName: (typeof queueNames)[number],
    processor: Processor<T>,
  ) {
    const worker = new Worker<T>(
      queueName,
      async (job) => {
        if (job.data.organizationId)
          await this.enforceTenantRate(queueName, job.data.organizationId);
        return processor(job);
      },
      { connection: { url: this.redisUrl }, concurrency: 5 },
    );
    worker.on(
      'failed',
      (job, error) => void this.deadLetter(queueName, job, error),
    );
    this.workers.push(worker);
    return worker;
  }

  async runOnce<T>(
    context: TenantContext,
    jobKey: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.tenants.withTenant(context, async (tx) => {
        await tx.jobExecution.create({
          data: { id: newId(), organizationId: context.organizationId, jobKey },
        });
        return operation(tx);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        return undefined;
      throw error;
    }
  }

  async ping() {
    this.redis ??= new IORedis(this.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    if (this.redis.status === 'wait') await this.redis.connect();
    return this.redis.ping();
  }

  async metrics() {
    return Object.fromEntries(
      await Promise.all(
        queueNames.map(async (name) => [
          name,
          await this.queue(name).getJobCounts(
            'waiting',
            'active',
            'completed',
            'failed',
            'delayed',
          ),
        ]),
      ),
    );
  }

  async deadLetterCount(queueName: (typeof queueNames)[number]) {
    const counts = await this.queue(`${queueName}-dead-letter`).getJobCounts(
      'waiting',
      'delayed',
    );
    return (counts.waiting ?? 0) + (counts.delayed ?? 0);
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    if (this.redis && this.redis.status !== 'end') this.redis.disconnect();
  }

  private queue(name: string) {
    let queue = this.queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: { url: this.redisUrl } });
      this.queues.set(name, queue);
    }
    return queue;
  }

  private async enforceTenantRate(queueName: string, organizationId: string) {
    this.redis ??= new IORedis(this.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    if (this.redis.status === 'wait') await this.redis.connect();
    const key = `queue-rate:${queueName}:${organizationId}:${Math.floor(Date.now() / 60_000)}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 60);
    if (count > this.tenantRateLimit)
      throw new Error('Tenant queue rate exceeded');
  }

  private async deadLetter(
    queueName: string,
    job: Job | undefined,
    error: Error,
  ) {
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    await this.queue(`${queueName}-dead-letter`).add(job.name, {
      originalJobId: job.id,
      data: job.data,
      error: error.message,
      failedAt: new Date().toISOString(),
    });
  }
}
