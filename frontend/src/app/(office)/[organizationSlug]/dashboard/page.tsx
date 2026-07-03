import { AppShell } from '../../../../components/app-shell';
import { OperationsDashboard } from '../../../../components/operations-dashboard';

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <OperationsDashboard organizationSlug={organizationSlug} />
    </AppShell>
  );
}
