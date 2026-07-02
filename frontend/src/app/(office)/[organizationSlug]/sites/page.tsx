import { AppShell } from '../../../../components/app-shell';
import { SitesScreen } from '../../../../components/office-domain-screens';

export default async function SitesPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <SitesScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
