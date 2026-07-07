import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TenantDatabase } from '../database/tenant-database.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class NotificationStream {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly metrics: MetricsService,
  ) {}

  open(
    request: Request,
    response: Response,
    organizationId: string,
    userId: string,
  ) {
    response.status(200);
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    this.metrics.sseConnections.inc();
    let cursor = String(request.headers['last-event-id'] ?? '');
    let polling = false;
    let closed = false;
    let cleaned = false;
    const close = () => {
      if (cleaned) return;
      cleaned = true;
      closed = true;
      this.metrics.sseConnections.dec();
      if (updates) clearInterval(updates);
      if (heartbeat) clearInterval(heartbeat);
    };
    const poll = async () => {
      if (polling || closed) return;
      polling = true;
      try {
        const notifications = await this.tenants.withMembership(
          { organizationId, userId },
          async (tx) => {
            const previous = cursor
              ? await tx.notification.findFirst({
                  where: { id: cursor, organizationId, userId },
                })
              : null;
            return tx.notification.findMany({
              where: {
                organizationId,
                userId,
                ...(previous ? { createdAt: { gt: previous.createdAt } } : {}),
              },
              orderBy: { createdAt: 'asc' },
              take: 100,
            });
          },
        );
        for (const notification of notifications) {
          cursor = notification.id;
          response.write(formatSse('notification', notification, cursor));
        }
      } catch {
        response.write(formatSse('revoked', { organizationId }));
        response.end();
        close();
      } finally {
        polling = false;
      }
    };
    const updates = setInterval(() => void poll(), 1_000);
    const heartbeat = setInterval(
      () =>
        response.write(
          formatSse('heartbeat', { at: new Date().toISOString() }),
        ),
      15_000,
    );
    void poll();
    request.on('close', close);
  }
}

export function formatSse(event: string, data: unknown, id?: string) {
  return `${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
