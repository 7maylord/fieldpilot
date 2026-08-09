import { AppShell } from '../../../../components/app-shell';
import { DefectsScreen } from '../../../../components/defects-screen';

export default async function DefectsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <DefectsScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
