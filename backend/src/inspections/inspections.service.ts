import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { newId } from '../common/id';
import { TenantDatabase } from '../database/tenant-database.service';
import { evaluateForm, type FormSchema } from '../forms/form-schema';
import type {
  CreateInspectionDto,
  ReviewInspectionDto,
  SaveInspectionDraftDto,
  SubmitInspectionDto,
} from './dto';

@Injectable()
export class InspectionsService {
  constructor(
    private readonly tenants: TenantDatabase,
    private readonly audit: AuditService,
  ) {}

  create(organizationId: string, userId: string, input: CreateInspectionDto) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const membership = await tx.membership.findUniqueOrThrow({
          where: { organizationId_userId: { organizationId, userId } },
        });
        const [project, formVersion] = await Promise.all([
          tx.project.findFirst({
            where: {
              id: input.projectId,
              organizationId,
              ...(membership.isExternal
                ? { access: { some: { userId } } }
                : {}),
            },
          }),
          tx.formVersion.findFirst({
            where: {
              id: input.formVersionId,
              organizationId,
              status: 'published',
            },
          }),
        ]);
        if (!project) throw new ForbiddenException('Project access denied');
        if (!formVersion)
          throw new BadRequestException('A published form version is required');
        if (
          input.workOrderId &&
          !(await tx.workOrder.findFirst({
            where: {
              id: input.workOrderId,
              organizationId,
              projectId: input.projectId,
            },
          }))
        )
          throw new BadRequestException(
            'Work order must belong to the project',
          );
        const inspection = await tx.inspection.create({
          data: {
            id: newId(),
            organizationId,
            projectId: input.projectId,
            workOrderId: input.workOrderId,
            formVersionId: input.formVersionId,
            inspectorId: userId,
            inspectionType: input.inspectionType,
          },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          inspection.id,
          'inspection.created',
        );
        return inspection;
      },
    );
  }

  saveDraft(
    organizationId: string,
    userId: string,
    inspectionId: string,
    input: SaveInspectionDraftDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        await this.ownedEditable(tx, organizationId, userId, inspectionId);
        const updated = await tx.inspection.updateMany({
          where: { id: inspectionId, organizationId, version: input.version },
          data: {
            draftAnswers: input.answers as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        if (!updated.count)
          throw new ConflictException('Inspection version is stale');
        return tx.inspection.findUniqueOrThrow({ where: { id: inspectionId } });
      },
    );
  }

  submit(
    organizationId: string,
    userId: string,
    inspectionId: string,
    input: SubmitInspectionDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const inspection = await this.ownedEditable(
          tx,
          organizationId,
          userId,
          inspectionId,
        );
        if (inspection.version !== input.version)
          throw new ConflictException('Inspection version is stale');
        const formVersion = await tx.formVersion.findUniqueOrThrow({
          where: { id: inspection.formVersionId },
        });
        const evaluation = evaluateForm(
          formVersion.schema as FormSchema,
          input.answers,
        );
        if (!evaluation.valid)
          throw new BadRequestException({
            message: 'Inspection answers are invalid',
            errors: evaluation.errors,
          });
        for (const [fieldId, rule] of Object.entries(evaluation.evidence)) {
          const evidence = input.answers[`${fieldId}_evidence`];
          if (
            !Array.isArray(evidence) ||
            evidence.length < rule!.minimum ||
            (await tx.mediaObject.count({
              where: {
                id: {
                  in: evidence.filter(
                    (id): id is string => typeof id === 'string',
                  ),
                },
                organizationId,
                status: 'ready',
                links: {
                  some: { entityType: 'inspection', entityId: inspectionId },
                },
              },
            })) < rule!.minimum
          )
            throw new BadRequestException(
              `Evidence is required for ${fieldId}`,
            );
        }
        const revision =
          (await tx.formSubmission.count({ where: { inspectionId } })) + 1;
        const submission = await tx.formSubmission.create({
          data: {
            id: newId(),
            organizationId,
            inspectionId,
            formVersionId: inspection.formVersionId,
            revision,
            answers: evaluation.answers as Prisma.InputJsonValue,
            outcome: input.outcome,
            submittedBy: userId,
          },
        });
        await tx.inspection.update({
          where: { id: inspectionId },
          data: {
            status: 'submitted',
            draftAnswers: evaluation.answers as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          inspectionId,
          'inspection.submitted',
          { submissionId: submission.id, revision },
        );
        return submission;
      },
    );
  }

  review(
    organizationId: string,
    userId: string,
    inspectionId: string,
    input: ReviewInspectionDto,
  ) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const inspection = await tx.inspection.findFirst({
          where: { id: inspectionId, organizationId, status: 'submitted' },
        });
        if (!inspection)
          throw new ConflictException('Inspection is not awaiting review');
        const submission = await tx.formSubmission.findFirst({
          where: { inspectionId },
          orderBy: { revision: 'desc' },
        });
        if (!submission)
          throw new NotFoundException('Inspection submission not found');
        const status =
          input.decision === 'approve'
            ? 'approved'
            : input.decision === 'reject'
              ? 'rejected'
              : 'clarification_requested';
        const review = await tx.inspectionReview.create({
          data: {
            id: newId(),
            organizationId,
            inspectionId,
            submissionId: submission.id,
            reviewerId: userId,
            decision: input.decision,
            comment: input.comment,
          },
        });
        await tx.inspection.update({
          where: { id: inspectionId },
          data: { status, version: { increment: 1 } },
        });
        await this.record(
          tx,
          organizationId,
          userId,
          inspectionId,
          `inspection.${status}`,
          { submissionId: submission.id },
        );
        return review;
      },
    );
  }

  get(organizationId: string, userId: string, inspectionId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const inspection = await tx.inspection.findFirst({
          where: { id: inspectionId, organizationId },
          include: {
            formVersion: true,
            submissions: { orderBy: { revision: 'asc' } },
            reviews: true,
          },
        });
        if (!inspection) throw new NotFoundException('Inspection not found');
        return inspection;
      },
    );
  }

  private async ownedEditable(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userId: string,
    inspectionId: string,
  ) {
    const inspection = await tx.inspection.findFirst({
      where: { id: inspectionId, organizationId, inspectorId: userId },
    });
    if (!inspection) throw new NotFoundException('Inspection not found');
    if (
      !['draft', 'rejected', 'clarification_requested'].includes(
        inspection.status,
      )
    )
      throw new ConflictException('Inspection is not editable');
    return inspection;
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
      resourceType: 'inspection',
      resourceId,
      summary,
    });
    await this.audit.enqueue(tx, {
      organizationId,
      eventType: action,
      aggregateId: resourceId,
      payload: { inspectionId: resourceId },
    });
  }
}
