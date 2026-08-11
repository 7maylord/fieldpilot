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

export const severities = ['critical', 'high', 'medium', 'low'] as const;

export function severityLabel(severity: string) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

/*
 * Mirrors backend/src/authorization/capability.ts's `roleCapabilities`.
 * Client-side only — a UX gate for which buttons render, not a security
 * boundary; the server re-checks every capability on every request.
 */
const memberCapabilities = [
  'work_orders.complete',
  'inspections.perform',
  'defects.create',
];

const allCapabilities = [
  'organization.manage',
  'members.invite',
  'teams.manage',
  'projects.manage',
  'work_orders.create',
  'work_orders.assign',
  'work_orders.complete',
  'inspections.perform',
  'inspections.approve',
  'defects.create',
  'defects.assign',
  'defects.verify',
  'assets.manage',
  'reports.publish',
  'audit.view',
];

const roleCapabilities: Record<string, readonly string[]> = {
  owner: allCapabilities,
  admin: allCapabilities,
  manager: allCapabilities.filter(
    (capability) => capability !== 'organization.manage',
  ),
  coordinator: [
    'teams.manage',
    'projects.manage',
    'work_orders.create',
    'work_orders.assign',
    'defects.assign',
    'assets.manage',
    ...memberCapabilities,
  ],
  member: memberCapabilities,
  viewer: [],
  external: memberCapabilities,
};

export function capabilitiesForRole(
  role: string,
  isExternal: boolean,
): string[] {
  const effectiveRole = isExternal ? 'external' : role;
  return [...(roleCapabilities[effectiveRole] ?? [])];
}
