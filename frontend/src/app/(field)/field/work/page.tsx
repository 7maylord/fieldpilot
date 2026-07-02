import { AppShell } from '../../../../components/app-shell';
import { FieldWorkScreen } from '../../../../components/field-work-screen';

export default function MyWorkPage() {
  return (
    <AppShell mode="field">
      <FieldWorkScreen view="mine" />
    </AppShell>
  );
}
