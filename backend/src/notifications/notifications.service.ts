import { Injectable, NotFoundException } from '@nestjs/common';
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
    if (eventType !== 'work_order.assigned') return;
    const organizationId = String(data.organizationId);
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
}
