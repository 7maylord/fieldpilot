import { AppShell } from '../../../../components/app-shell';
import { AssetsScreen } from '../../../../components/assets-screen';
export default async function AssetsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <AssetsScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
