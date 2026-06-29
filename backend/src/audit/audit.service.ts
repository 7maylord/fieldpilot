import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { newId } from '../common/id';

interface AuditInput {
  organizationId: string;
  actorId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  requestId?: string;
  summary?: Prisma.InputJsonValue;
}

interface OutboxInput {
  organizationId: string;
  eventType: string;
  aggregateId: string;
  payload: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  write(tx: Prisma.TransactionClient, input: AuditInput) {
    return tx.auditEvent.create({
      data: {
        id: newId(),
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        requestId: input.requestId,
        summary: input.summary ?? {},
      },
    });
  }

  enqueue(tx: Prisma.TransactionClient, input: OutboxInput) {
    return tx.outboxEvent.create({
      data: {
        id: newId(),
        organizationId: input.organizationId,
        eventType: input.eventType,
        aggregateId: input.aggregateId,
        payload: input.payload,
      },
    });
  }
}
