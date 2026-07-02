import { AppShell } from '../../../../components/app-shell';
import { WorkOrdersScreen } from '../../../../components/office-domain-screens';

export default async function WorkPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <WorkOrdersScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
