import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import type { CompleteUploadDto, CreateUploadSessionDto } from './dto';
import { MalwareScanner } from './malware-scanner.service';
import { S3Service } from './s3.service';

const partSize = 5 * 1024 * 1024;

@Injectable()
export class MediaService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly storage: S3Service,
    private readonly scanner: MalwareScanner,
    private readonly audit: AuditService,
  ) {}

  createSession(
    organizationId: string,
    userId: string,
    input: CreateUploadSessionDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          input.projectId,
        );
        if (Boolean(input.sourceMediaId) !== Boolean(input.derivativeType))
          throw new BadRequestException(
            'Derivative source and type are required together',
          );
        if (
          input.sourceMediaId &&
          !(await tx.mediaObject.findFirst({
            where: {
              id: input.sourceMediaId,
              organizationId,
              projectId: input.projectId,
            },
          }))
        )
          throw new BadRequestException('Derivative source is invalid');
        const mediaId = input.mediaId ?? newId();
        const key = `organizations/${organizationId}/projects/${input.projectId}/media/${mediaId}/original`;
        const uploadId = await this.storage.createMultipart(key);
        const totalParts = Math.ceil(input.byteSize / partSize);
        const sessionId = newId();
        await tx.mediaObject.create({
          data: {
            id: mediaId,
            organizationId,
            projectId: input.projectId,
            objectKey: key,
            mimeType: input.mimeType,
            byteSize: BigInt(input.byteSize),
            sha256: input.sha256,
            status: 'uploading',
            createdBy: userId,
            sessions: {
              create: {
                id: sessionId,
                organizationId,
                multipartUploadId: uploadId,
                partSize,
                totalParts,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
            },
            links: {
              create: {
                id: newId(),
                organizationId,
                entityType: input.entityType,
                entityId: input.entityId,
              },
            },
            ...(input.sourceMediaId && input.derivativeType
              ? {
                  derivativeOf: {
                    create: {
                      id: newId(),
                      organizationId,
                      sourceMediaId: input.sourceMediaId,
                      derivativeType: input.derivativeType,
                    },
                  },
                }
              : {}),
          },
        });
        return {
          mediaId,
          sessionId,
          partSize,
          totalParts,
          partUrls: Array.from({ length: totalParts }, (_, index) => ({
            partNumber: index + 1,
            url: this.storage.partUrl(key, uploadId, index + 1),
          })),
        };
      },
    );
  }

  resume(organizationId: string, userId: string, sessionId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const session = await tx.mediaUploadSession.findFirst({
          where: {
            id: sessionId,
            organizationId,
            status: 'open',
            expiresAt: { gt: new Date() },
          },
          include: { media: true },
        });
        if (!session)
          throw new NotFoundException('Upload session not found or expired');
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          session.media.projectId,
        );
        return {
          mediaId: session.mediaId,
          partSize: session.partSize,
          completedParts: session.completedParts,
          partUrls: Array.from({ length: session.totalParts }, (_, index) => ({
            partNumber: index + 1,
            url: this.storage.partUrl(
              session.media.objectKey,
              session.multipartUploadId,
              index + 1,
            ),
          })),
        };
      },
    );
  }

  async complete(
    organizationId: string,
    userId: string,
    sessionId: string,
    input: CompleteUploadDto,
  ) {
    const session = await this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const found = await tx.mediaUploadSession.findFirst({
          where: {
            id: sessionId,
            organizationId,
            status: 'open',
            expiresAt: { gt: new Date() },
          },
          include: { media: true },
        });
        if (!found)
          throw new NotFoundException('Upload session not found or expired');
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          found.media.projectId,
        );
        if (
          input.parts.length !== found.totalParts ||
          new Set(input.parts.map(({ partNumber }) => partNumber)).size !==
            found.totalParts
        )
          throw new BadRequestException(
            'Every upload part must be completed exactly once',
          );
        return found;
      },
    );
    await this.storage.completeMultipart(
      session.media.objectKey,
      session.multipartUploadId,
      input.parts,
    );
    await this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await tx.mediaUploadSession.update({
          where: { id: sessionId },
          data: {
            status: 'completed',
            completedParts: input.parts as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.mediaObject.update({
          where: { id: session.mediaId },
          data: { status: 'processing' },
        });
      },
    );
    const outcome = await this.inspect(session.media);
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const result = await tx.mediaObject.update({
          where: { id: session.mediaId },
          data: {
            ...outcome,
            ...(outcome.status === 'ready' ? { immutableAt: new Date() } : {}),
          },
        });
        await this.audit.write(tx, {
          organizationId,
          actorId: userId,
          action: `media.${result.status}`,
          resourceType: 'media_object',
          resourceId: session.mediaId,
          summary: { sha256: session.media.sha256 },
        });
        return {
          mediaId: result.id,
          status: result.status,
          scanStatus: result.scanStatus,
        };
      },
    );
  }

  signedUrl(organizationId: string, userId: string, mediaId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const media = await tx.mediaObject.findFirst({
          where: { id: mediaId, organizationId, status: 'ready' },
        });
        if (!media) throw new NotFoundException('Media not found');
        await this.assertProjectAccess(
          tx,
          organizationId,
          userId,
          media.projectId,
        );
        return {
          url: this.storage.downloadUrl(media.objectKey),
          expiresInSeconds: 300,
        };
      },
    );
  }

  private async inspect(media: {
    id: string;
    objectKey: string;
    sha256: string;
    mimeType: string;
  }) {
    const bytes = await this.storage.bytes(media.objectKey);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== media.sha256 || !matchesMime(bytes, media.mimeType))
      return { status: 'rejected', scanStatus: 'failed' };
    try {
      return (await this.scanner.scan(bytes)) === 'infected'
        ? { status: 'quarantined', scanStatus: 'infected' }
        : { status: 'ready', scanStatus: 'clean' };
    } catch {
      return { status: 'quarantined', scanStatus: 'failed' };
    }
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
    const project = await tx.project.findFirst({
      where: {
        id: projectId,
        organizationId,
        ...(membership.isExternal ? { access: { some: { userId } } } : {}),
      },
    });
    if (!project) throw new ForbiddenException('Project access denied');
  }
}

function matchesMime(bytes: Uint8Array, mime: string) {
  if (mime === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8;
  if (mime === 'image/png')
    return bytes.slice(0, 8).toString() === '137,80,78,71,13,10,26,10';
  if (mime === 'application/pdf')
    return new TextDecoder().decode(bytes.slice(0, 4)) === '%PDF';
  return (
    mime === 'video/mp4' &&
    new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp'
  );
}
