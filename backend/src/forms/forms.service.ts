import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import type { CreateFormTemplateDto, UpdateFormDraftDto } from './dto';
import { validateFormSchema } from './form-schema';

@Injectable()
export class FormsService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  list(organizationId: string, userId: string) {
    return this.tenants.withMembership({ organizationId, userId }, (tx) =>
      tx.formTemplate.findMany({
        where: { organizationId },
        include: { versions: { orderBy: { versionNumber: 'desc' } } },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }

  create(organizationId: string, userId: string, input: CreateFormTemplateDto) {
    validateFormSchema(input.schema);
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const template = await tx.formTemplate.create({
          data: {
            id: newId(),
            organizationId,
            name: input.name.trim(),
            description: input.description,
            createdBy: userId,
            versions: {
              create: {
                id: newId(),
                organizationId,
                versionNumber: 1,
                schema: input.schema as Prisma.InputJsonValue,
                createdBy: userId,
              },
            },
          },
          include: { versions: true },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          template.id,
          'form_template.created',
        );
        return template;
      },
    );
  }

  updateDraft(
    organizationId: string,
    userId: string,
    templateId: string,
    input: UpdateFormDraftDto,
  ) {
    validateFormSchema(input.schema);
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const template = await tx.formTemplate.findFirst({
          where: { id: templateId, organizationId },
          include: { versions: { orderBy: { versionNumber: 'desc' } } },
        });
        if (!template) throw new NotFoundException('Form template not found');
        const draft = template.versions.find(
          ({ status }) => status === 'draft',
        );
        const version = draft
          ? await tx.formVersion.update({
              where: { id: draft.id },
              data: { schema: input.schema as Prisma.InputJsonValue },
            })
          : await tx.formVersion.create({
              data: {
                id: newId(),
                organizationId,
                templateId,
                versionNumber: template.versions[0]!.versionNumber + 1,
                schema: input.schema as Prisma.InputJsonValue,
                createdBy: userId,
              },
            });
        if (input.name || input.description)
          await tx.formTemplate.update({
            where: { id: templateId },
            data: { name: input.name?.trim(), description: input.description },
          });
        return version;
      },
    );
  }

  publish(organizationId: string, userId: string, templateId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const draft = await tx.formVersion.findFirst({
          where: { organizationId, templateId, status: 'draft' },
        });
        if (!draft)
          throw new ConflictException('No draft is available to publish');
        validateFormSchema(draft.schema);
        const published = await tx.formVersion.update({
          where: { id: draft.id },
          data: { status: 'published', publishedAt: new Date() },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          templateId,
          'form_version.published',
          {
            formVersionId: published.id,
            versionNumber: published.versionNumber,
          },
        );
        return published;
      },
    );
  }

  duplicate(
    organizationId: string,
    userId: string,
    templateId: string,
    name: string,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const source = await tx.formVersion.findFirst({
          where: { organizationId, templateId },
          orderBy: { versionNumber: 'desc' },
        });
        if (!source) throw new NotFoundException('Form template not found');
        return tx.formTemplate.create({
          data: {
            id: newId(),
            organizationId,
            name: name.trim(),
            createdBy: userId,
            versions: {
              create: {
                id: newId(),
                organizationId,
                versionNumber: 1,
                schema: source.schema as Prisma.InputJsonValue,
                createdBy: userId,
              },
            },
          },
          include: { versions: true },
        });
      },
    );
  }

  compare(
    organizationId: string,
    userId: string,
    leftId: string,
    rightId: string,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const versions = await tx.formVersion.findMany({
          where: { organizationId, id: { in: [leftId, rightId] } },
        });
        const versionsById = new Map(
          versions.map((version) => [version.id, version]),
        );
        const leftVersion = versionsById.get(leftId);
        const rightVersion = versionsById.get(rightId);
        if (!leftVersion || !rightVersion)
          throw new NotFoundException('Form version not found');
        const fields = [leftVersion, rightVersion].map(
          ({ schema }) =>
            new Map(
              ((schema as { fields: { id: string }[] }).fields ?? []).map(
                (field) => [field.id, JSON.stringify(field)],
              ),
            ),
        );
        const [left, right] = fields as [
          Map<string, string>,
          Map<string, string>,
        ];
        return {
          added: [...right.keys()].filter((id) => !left.has(id)),
          removed: [...left.keys()].filter((id) => !right.has(id)),
          changed: [...left.keys()].filter(
            (id) => right.has(id) && left.get(id) !== right.get(id),
          ),
        };
      },
    );
  }

  private async record(
    tx: Prisma.TransactionClient,
    organizationId: string,
    actorId: string,
    resourceId: string,
    action: string,
    summary: Prisma.InputJsonValue = {},
  ) {
    await this.audit.write(tx, {
      organizationId,
      actorId,
      action,
      resourceType: 'form_template',
      resourceId,
      summary,
    });
    await this.audit.enqueue(tx, {
      organizationId,
      eventType: action,
      aggregateId: resourceId,
      payload: { formTemplateId: resourceId },
    });
  }
}
