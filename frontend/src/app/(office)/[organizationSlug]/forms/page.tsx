import { AppShell } from '../../../../components/app-shell';
import { FormEditor } from '../../../../components/form-editor';

export default async function FormsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  return (
    <AppShell mode="office">
      <FormEditor organizationSlug={organizationSlug} />
    </AppShell>
  );
}
