import { AppShell } from '../../../../components/app-shell';
import { FieldDefectCapture } from '../../../../components/field-defect-capture';

export default function DefectsPage() {
  return (
    <AppShell mode="field">
      <FieldDefectCapture />
    </AppShell>
  );
}
