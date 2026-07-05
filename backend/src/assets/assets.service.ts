import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import type {
  CreateAssetDto,
  CreateAssetTypeDto,
  CreateMeterReadingDto,
} from './dto';

@Injectable()
export class AssetsService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  types(organizationId: string, userId: string) {
    return this.tenants.withMembership({ organizationId, userId }, (tx) =>
      tx.assetType.findMany({
        where: { organizationId },
        orderBy: { name: 'asc' },
      }),
    );
  }
  createType(
    organizationId: string,
    userId: string,
    input: CreateAssetTypeDto,
  ) {
    return this.tenants.withMembership({ organizationId, userId }, (tx) =>
      tx.assetType.create({
        data: {
          id: newId(),
          organizationId,
          name: input.name.trim(),
          description: input.description,
        },
      }),
    );
  }
  list(organizationId: string, userId: string, projectId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(tx, organizationId, userId, projectId);
        return tx.asset.findMany({
          where: { organizationId, projectId },
          include: { assetType: true },
          orderBy: { name: 'asc' },
        });
      },
    );
  }
  create(organizationId: string, userId: string, input: CreateAssetDto) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          input.projectId,
        );
        if (
          !(await tx.assetType.findFirst({
            where: { id: input.assetTypeId, organizationId },
          }))
        )
          throw new BadRequestException(
            'Asset type does not belong to the organization',
          );
        if (
          input.locationId &&
          !(await tx.location.findFirst({
            where: {
              id: input.locationId,
              organizationId,
              projectId: input.projectId,
            },
          }))
        )
          throw new BadRequestException(
            'Asset location must belong to the project',
          );
        const asset = await tx.asset.create({
          data: {
            id: newId(),
            organizationId,
            projectId: input.projectId,
            assetTypeId: input.assetTypeId,
            locationId: input.locationId,
            name: input.name.trim(),
            qrCode: input.qrCode.trim(),
            serialNumber: input.serialNumber,
            model: input.model,
            manufacturer: input.manufacturer,
            status: input.status,
          },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          asset.id,
          'asset.created',
        );
        return asset;
      },
    );
  }
  byQr(organizationId: string, userId: string, qrCode: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const asset = await tx.asset.findFirst({
          where: { organizationId, qrCode },
          include: { assetType: true },
        });
        if (!asset) throw new NotFoundException('Asset not found');
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          asset.projectId,
        );
        return asset;
      },
    );
  }
  get(organizationId: string, userId: string, assetId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const asset = await tx.asset.findFirst({
          where: { id: assetId, organizationId },
          include: {
            assetType: true,
            meterReadings: { orderBy: { recordedAt: 'desc' } },
            inspections: {
              include: { submissions: true },
              orderBy: { createdAt: 'desc' },
            },
            defects: {
              include: { statusEvents: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        });
        if (!asset) throw new NotFoundException('Asset not found');
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          asset.projectId,
        );
        return asset;
      },
    );
  }
  addReading(
    organizationId: string,
    userId: string,
    assetId: string,
    input: CreateMeterReadingDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const asset = await tx.asset.findFirst({
          where: { id: assetId, organizationId },
        });
        if (!asset) throw new NotFoundException('Asset not found');
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          asset.projectId,
        );
        const previous = await tx.meterReading.findFirst({
          where: { organizationId, assetId, meterType: input.meterType },
          orderBy: { recordedAt: 'desc' },
        });
        if (previous && input.value < Number(previous.value))
          throw new BadRequestException(
            'Cumulative meter readings cannot decrease',
          );
        const reading = await tx.meterReading.create({
          data: {
            id: newId(),
            organizationId,
            assetId,
            meterType: input.meterType.trim(),
            value: input.value,
            unit: input.unit.trim(),
            recordedAt: new Date(input.recordedAt),
            recordedBy: userId,
          },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          assetId,
          'asset.meter_reading_added',
        );
        return reading;
      },
    );
  }
  private async assertProjectAccess(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    projectId: string,
  ) {
    const membership = await tx.membership.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (
      !(await tx.project.findFirst({
        where: {
          id: projectId,
          organizationId,
          ...(membership.isExternal ? { access: { some: { userId } } } : {}),
        },
      }))
    )
      throw new ForbiddenException('Project access denied');
  }
  private async record(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    assetId: string,
    action: string,
  ) {
    await this.audit.write(tx, {
      organizationId,
      actorId,
      action,
      resourceType: 'asset',
      resourceId: assetId,
    });
    await this.audit.enqueue(tx, {
      organizationId,
      eventType: action,
      aggregateId: assetId,
      payload: { assetId },
    });
  }
}
