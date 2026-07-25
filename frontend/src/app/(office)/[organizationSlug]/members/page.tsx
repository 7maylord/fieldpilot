import { AppShell } from '../../../../components/app-shell';
import { MembersScreen } from '../../../../components/members-screen';

export default async function MembersPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <MembersScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
