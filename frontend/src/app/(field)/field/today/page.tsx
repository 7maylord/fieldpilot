import { AppShell } from '../../../../components/app-shell';
import { OperationsDashboard } from '../../../../components/operations-dashboard';

export default function TodayPage() {
  return (
    <AppShell mode="field">
      <OperationsDashboard />
    </AppShell>
  );
}
