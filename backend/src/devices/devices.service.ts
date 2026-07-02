import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { loadConfig } from '../config/app.config';
import { TenantDatabase } from '../database/tenant-database.service';
import type { RegisterDeviceDto, UpdateDeviceVersionDto } from './dto';

@Injectable()
export class DevicesService {
  private readonly packageTtlMs =
    loadConfig().offlinePackageTtlHours * 60 * 60 * 1000;

  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  register(organizationId: string, userId: string, input: RegisterDeviceDto) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const existing = await tx.syncDevice.findUnique({
          where: { id: input.deviceId },
        });
        if (existing)
          throw new ConflictException('Device is already registered');
        const device = await tx.syncDevice.create({
          data: {
            id: input.deviceId,
            organizationId,
            userId,
            name: input.name.trim(),
            platform: input.platform,
            appVersion: input.appVersion,
            packageExpiresAt: this.nextExpiry(),
          },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          device.id,
          'device.registered',
        );
        return device;
      },
    );
  }

  list(organizationId: string, userId: string) {
    return this.tenants.withMembership({ organizationId, userId }, (tx) =>
      tx.syncDevice.findMany({
        where: { organizationId, userId },
        orderBy: { lastSeenAt: 'desc' },
      }),
    );
  }

  touch(
    organizationId: string,
    userId: string,
    deviceId: string,
    input: UpdateDeviceVersionDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const device = await this.ownDevice(
          tx,
          organizationId,
          userId,
          deviceId,
        );
        await this.assertUsable(tx, device);
        return tx.syncDevice.update({
          where: { id: deviceId },
          data: { appVersion: input.appVersion, lastSeenAt: new Date() },
        });
      },
    );
  }

  renewPackage(organizationId: string, userId: string, deviceId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const device = await this.ownDevice(
          tx,
          organizationId,
          userId,
          deviceId,
        );
        if (device.revokedAt) throw new ForbiddenException('Device is revoked');
        if (device.purgeRequestedAt && !device.purgeAcknowledgedAt)
          throw new ConflictException(
            'Local purge must be acknowledged before package renewal',
          );
        return tx.syncDevice.update({
          where: { id: deviceId },
          data: {
            packageExpiresAt: this.nextExpiry(),
            purgeRequestedAt: null,
            purgeReason: null,
            purgeAcknowledgedAt: null,
            lastSeenAt: new Date(),
          },
        });
      },
    );
  }

  status(organizationId: string, userId: string, deviceId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        let device = await this.ownDevice(tx, organizationId, userId, deviceId);
        if (
          !device.revokedAt &&
          device.packageExpiresAt <= new Date() &&
          !device.purgeRequestedAt
        )
          device = await tx.syncDevice.update({
            where: { id: deviceId },
            data: {
              purgeRequestedAt: new Date(),
              purgeReason: 'package_expired',
            },
          });
        return {
          revoked: Boolean(device.revokedAt),
          packageExpiresAt: device.packageExpiresAt,
          purgeRequestedAt: device.purgeRequestedAt,
          purgeReason: device.purgeReason,
          purgeAcknowledgedAt: device.purgeAcknowledgedAt,
          localAction: device.purgeRequestedAt
            ? 'quarantine_unsynced_then_purge'
            : null,
        };
      },
    );
  }

  revoke(organizationId: string, actorId: string, deviceId: string) {
    return this.requestPurge(organizationId, actorId, deviceId, true);
  }

  requestPurge(
    organizationId: string,
    actorId: string,
    deviceId: string,
    revoke = false,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId: actorId },
      async (tx) => {
        const device = await tx.syncDevice.findFirst({
          where: { id: deviceId, organizationId },
        });
        if (!device) throw new NotFoundException('Device not found');
        const now = new Date();
        const updated = await tx.syncDevice.update({
          where: { id: deviceId },
          data: {
            ...(revoke ? { revokedAt: device.revokedAt ?? now } : {}),
            purgeRequestedAt: now,
            purgeReason: revoke ? 'remote_revoke' : 'admin_request',
            purgeAcknowledgedAt: null,
          },
        });
        await this.record(
          tx,
          organizationId,
          actorId,
          deviceId,
          revoke ? 'device.revoked' : 'device.purge_requested',
        );
        return updated;
      },
    );
  }

  acknowledgePurge(organizationId: string, userId: string, deviceId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const device = await this.ownDevice(
          tx,
          organizationId,
          userId,
          deviceId,
        );
        if (!device.purgeRequestedAt)
          throw new ConflictException('No purge has been requested');
        return tx.syncDevice.update({
          where: { id: deviceId },
          data: { purgeAcknowledgedAt: new Date() },
        });
      },
    );
  }

  private async ownDevice(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    deviceId: string,
  ) {
    const device = await tx.syncDevice.findFirst({
      where: { id: deviceId, organizationId, userId },
    });
    if (!device) throw new NotFoundException('Device not found');
    return device;
  }

  private async assertUsable(
    tx: Prisma.TransactionClient,
    device: Awaited<ReturnType<DevicesService['ownDevice']>>,
  ) {
    if (device.revokedAt) throw new ForbiddenException('Device is revoked');
    if (device.packageExpiresAt <= new Date()) {
      if (!device.purgeRequestedAt)
        await tx.syncDevice.update({
          where: { id: device.id },
          data: {
            purgeRequestedAt: new Date(),
            purgeReason: 'package_expired',
          },
        });
      throw new ForbiddenException('Offline package has expired');
    }
  }

  private nextExpiry() {
    return new Date(Date.now() + this.packageTtlMs);
  }

  private async record(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    deviceId: string,
    action: string,
  ) {
    await this.audit.write(tx, {
      organizationId,
      actorId,
      action,
      resourceType: 'sync_device',
      resourceId: deviceId,
    });
    await this.audit.enqueue(tx, {
      organizationId,
      eventType: action,
      aggregateId: deviceId,
      payload: { deviceId },
    });
  }
}
