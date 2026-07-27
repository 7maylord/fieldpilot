import { AppShell } from '../../../../components/app-shell';
import { MapsScreen } from '../../../../components/office-domain-screens';

export default async function MapsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <MapsScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
