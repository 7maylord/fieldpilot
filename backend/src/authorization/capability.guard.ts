import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { TenantDatabase } from '../database/tenant-database.service';
import { Capability, hasCapability } from './capability';

const CAPABILITY = 'capability';
export const RequiresCapability = (capability: Capability) =>
  SetMetadata(CAPABILITY, capability);

@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenants: TenantDatabase,
  ) {}

  async canActivate(context: ExecutionContext) {
    const capability = this.reflector.getAllAndOverride<Capability>(
      CAPABILITY,
      [context.getHandler(), context.getClass()],
    );
    if (!capability) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const organizationId = String(
      request.params.organizationId ??
        request.header('x-organization-id') ??
        '',
    );
    if (!organizationId)
      throw new ForbiddenException('Organization context required');
    return this.tenants.withMembership(
      { organizationId, userId: request.user.id },
      async (tx) => {
        const membership = await tx.membership.findUniqueOrThrow({
          where: {
            organizationId_userId: { organizationId, userId: request.user.id },
          },
        });
        if (!hasCapability(membership.role, membership.isExternal, capability))
          throw new ForbiddenException('Capability denied');
        return true;
      },
    );
  }
}
