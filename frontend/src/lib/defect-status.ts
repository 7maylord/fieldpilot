export {
  defectStatuses,
  defectTransitions,
  type DefectStatus,
} from '../generated/defect-status';
import {
  defectTransitions,
  type DefectStatus,
} from '../generated/defect-status';

/* States waiting on the office, used as the queue's default filter. */
export const needsOfficeAction: readonly DefectStatus[] = [
  'reported',
  'triaged',
  'ready_for_verification',
];

export function allowedTransitions(status: DefectStatus) {
  return defectTransitions[status] ?? [];
}

export function statusLabel(status: DefectStatus) {
  const words = status.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function severityLabel(severity: string) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}
