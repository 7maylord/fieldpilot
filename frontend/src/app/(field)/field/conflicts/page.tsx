import { AppShell } from '../../../../components/app-shell';
import { FieldConflictsScreen } from '../../../../components/field-conflicts-screen';

export default function ConflictsPage() {
  return (
    <AppShell mode="field">
      <FieldConflictsScreen />
    </AppShell>
  );
}
