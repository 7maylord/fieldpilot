import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createTransport } from 'nodemailer';
import { newId } from '../common/id';
import { loadConfig } from '../config/app.config';
import { TenantDatabase } from '../database/tenant-database.service';

@Injectable()
export class NotificationsService {
  private readonly config = loadConfig();
  private readonly mail = createTransport(this.config.email.smtpUrl);

  constructor(private readonly tenants: TenantDatabase) {}

  list(organizationId: string, userId: string) {
    return this.tenants.withMembership({ organizationId, userId }, (tx) =>
      tx.notification.findMany({
        where: { organizationId, userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }

  markRead(organizationId: string, userId: string, notificationId: string) {
    return this.tenants.withMembership(
      { organizationId, userId },
      async (tx) => {
        const result = await tx.notification.updateMany({
          where: { id: notificationId, organizationId, userId },
          data: { readAt: new Date() },
        });
        if (!result.count)
          throw new NotFoundException('Notification not found');
        return tx.notification.findUniqueOrThrow({
          where: { id: notificationId },
        });
      },
    );
  }

  async deliver(
    eventType: string,
    data: Record<string, unknown>,
    eventId: string,
  ) {
    const email = typeof data.email === 'string' ? data.email : undefined;
    if (!data.organizationId) {
      if (email) await this.sendIdentityEmail(eventType, email, data);
      return;
    }
    if (eventType === 'membership.invited') {
      if (email) await this.sendInvitationEmail(email, data);
      return;
    }
    const organizationId = String(data.organizationId);
    if (eventType !== 'work_order.assigned') {
      await this.deliverBroadcast(eventType, organizationId, data, eventId);
      return;
    }
    const assigneeId = String(data.assigneeId);
    const recipients = await this.tenants.withTenant(
      { organizationId, userId: organizationId },
      async (tx) => {
        const userIds =
          data.assigneeType === 'team'
            ? (
                await tx.teamMembership.findMany({
                  where: { organizationId, teamId: assigneeId },
                  select: { userId: true },
                })
              ).map(({ userId }) => userId)
            : data.assigneeType === 'user'
              ? [assigneeId]
              : [];
        const users = await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        });
        for (const user of users)
          await tx.notification.upsert({
            where: {
              sourceEventId_userId: { sourceEventId: eventId, userId: user.id },
            },
            create: {
              id: newId(),
              organizationId,
              userId: user.id,
              sourceEventId: eventId,
              kind: eventType,
              title: 'Work assigned',
              body: 'A work order was assigned to you or your team.',
              resourceType: 'work_order',
              resourceId: String(data.workOrderId),
            },
            update: {},
          });
        return users;
      },
    );
    await Promise.all(
      recipients.map(({ email: recipient }) =>
        this.mail.sendMail({
          from: this.config.email.from,
          to: recipient,
          subject: 'FieldPilot work assignment',
          text: 'A work order was assigned to you or your team.',
        }),
      ),
    );
  }

  private async deliverBroadcast(
    eventType: string,
    organizationId: string,
    data: Record<string, unknown>,
    eventId: string,
  ) {
    const copy = notificationCopy(eventType, data);
    if (!copy) return;
    await this.tenants.withTenant(
      { organizationId, userId: organizationId },
      async (tx) => {
        const recipients = await tx.membership.findMany({
          where: {
            organizationId,
            status: 'active',
            role: { in: ['owner', 'admin', 'manager', 'coordinator'] },
          },
          select: { userId: true },
        });
        await this.notifyUsers(
          tx,
          organizationId,
          recipients.map(({ userId }) => userId),
          eventId,
          eventType,
          copy.title,
          copy.body,
          copy.resourceType,
          copy.resourceId,
        );
      },
    );
  }

  private async notifyUsers(
    tx: Prisma.TransactionClient,
    organizationId: string,
    userIds: string[],
    eventId: string,
    kind: string,
    title: string,
    body: string,
    resourceType: string,
    resourceId: string,
  ) {
    for (const userId of new Set(userIds))
      await tx.notification.upsert({
        where: {
          sourceEventId_userId: { sourceEventId: eventId, userId },
        },
        create: {
          id: newId(),
          organizationId,
          userId,
          sourceEventId: eventId,
          kind,
          title,
          body,
          resourceType,
          resourceId,
        },
        update: {},
      });
  }

  private sendIdentityEmail(
    eventType: string,
    email: string,
    data: Record<string, unknown>,
  ) {
    const token = String(data.verificationToken ?? data.resetToken ?? '');
    const action = eventType.includes('verification')
      ? 'verify-email'
      : 'reset-password';
    return this.mail.sendMail({
      from: this.config.email.from,
      to: email,
      subject: eventType.includes('verification')
        ? 'Verify your FieldPilot email'
        : 'Reset your FieldPilot password',
      text: `${this.config.frontendUrl}/${action}?token=${encodeURIComponent(token)}`,
    });
  }

  private sendInvitationEmail(email: string, data: Record<string, unknown>) {
    const token = String(data.token ?? '');
    if (!token) return;
    return this.mail.sendMail({
      from: this.config.email.from,
      to: email,
      subject: 'Join your FieldPilot organization',
      text: `${this.config.frontendUrl}/accept-invitation?token=${encodeURIComponent(token)}`,
    });
  }
}

function notificationCopy(eventType: string, data: Record<string, unknown>) {
  const projectId = uuidValue(data.projectId);
  const siteId = uuidValue(data.siteId);
  const workOrderId = uuidValue(data.workOrderId);
  const reportId = uuidValue(data.reportId);
  if (eventType === 'project.created' && projectId)
    return {
      title: 'Project opened',
      body: 'A project workspace was created.',
      resourceType: 'project',
      resourceId: projectId,
    };
  if (eventType === 'project.archived' && projectId)
    return {
      title: 'Project closed',
      body: 'A project workspace was archived.',
      resourceType: 'project',
      resourceId: projectId,
    };
  if (eventType === 'site.created' && siteId)
    return {
      title: 'Site opened',
      body: 'A project site was opened for daily field tracking.',
      resourceType: 'site',
      resourceId: siteId,
    };
  if (eventType === 'work_order.created' && workOrderId)
    return {
      title: 'Dispatch review needed',
      body: 'A work order is ready for dispatch planning.',
      resourceType: 'work_order',
      resourceId: workOrderId,
    };
  if (eventType === 'work_order.transitioned' && workOrderId)
    return {
      title: 'Work status changed',
      body: 'A work order moved to a new operational status.',
      resourceType: 'work_order',
      resourceId: workOrderId,
    };
  if (eventType === 'daily_report.draft_created' && reportId)
    return {
      title: 'Daily report created',
      body: 'A project daily report was created for review.',
      resourceType: 'daily_report',
      resourceId: reportId,
    };
  if (eventType === 'daily_report.revised' && reportId)
    return {
      title: 'Daily report revised',
      body: 'A project daily report revision was created.',
      resourceType: 'daily_report',
      resourceId: reportId,
    };
  if (eventType === 'daily_report.published' && reportId)
    return {
      title: 'Daily report published',
      body: 'A project daily report was published.',
      resourceType: 'daily_report',
      resourceId: reportId,
    };
  return null;
}

function uuidValue(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}
