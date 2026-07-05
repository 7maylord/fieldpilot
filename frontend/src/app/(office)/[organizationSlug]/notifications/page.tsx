import { AppShell } from '../../../../components/app-shell';
import { NotificationsScreen } from '../../../../components/notifications-screen';

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <NotificationsScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
