import { AppShell } from '../../../../../components/app-shell';
import { OfflineInspectionForm } from '../../../../../components/offline-inspection-form';

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const { inspectionId } = await params;
  return (
    <AppShell mode="field">
      <OfflineInspectionForm inspectionId={inspectionId} />
    </AppShell>
  );
}
