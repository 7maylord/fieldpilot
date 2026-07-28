import { AppShell } from '../../../../components/app-shell';
import { FieldDownloadsScreen } from '../../../../components/field-downloads-screen';

export default function DownloadsPage() {
  return (
    <AppShell mode="field">
      <FieldDownloadsScreen />
    </AppShell>
  );
}
