import { AppShell } from '../../../../components/app-shell';
import { ProjectsScreen } from '../../../../components/projects-screen';

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <ProjectsScreen organizationSlug={organizationSlug} />
    </AppShell>
  );
}
