import { AppShell } from '../../../../components/app-shell';
import { ReportsScreen } from '../../../../components/reports-screen';
export default async function ReportsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <ReportsScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
