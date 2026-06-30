import { AppShell } from '../../../../components/app-shell';
import { OperationsDashboard } from '../../../../components/operations-dashboard';

export default function DashboardPage() {
  return (
    <AppShell mode="office">
      <OperationsDashboard />
    </AppShell>
  );
}
