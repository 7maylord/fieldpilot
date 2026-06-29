import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface TenantContext {
  organizationId: string;
  userId: string;
}

@Injectable()
export class TenantDatabase {
  constructor(private readonly prisma: PrismaService) {}

  withTenant<T>(
    context: TenantContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true)`;
      await tx.$queryRaw`SELECT set_config('app.user_id', ${context.userId}, true)`;
      return operation(tx);
    });
  }

  withMembership<T>(
    context: TenantContext,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.withTenant(context, async (tx) => {
      const membership = await tx.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: context.organizationId,
            userId: context.userId,
          },
        },
      });
      if (!membership || membership.status !== 'active')
        throw new ForbiddenException('Organization access denied');
      return operation(tx);
    });
  }
}
