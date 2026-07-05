import { AppShell } from '../../../../components/app-shell';
import { DispatchScreen } from '../../../../components/office-domain-screens';

export default async function DispatchPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <DispatchScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
