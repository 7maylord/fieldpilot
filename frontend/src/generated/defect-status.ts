// GENERATED FILE — do not edit by hand.
// Source of truth: backend/src/defects/defect-state.ts
// Regenerate with: pnpm --dir frontend defect-status:generate

export const defectStatuses = [
  'reported',
  'triaged',
  'assigned',
  'correction_in_progress',
  'ready_for_verification',
  'verified',
  'closed',
  'reopened',
  'deferred',
  'cancelled',
] as const;
export type DefectStatus = (typeof defectStatuses)[number];

export const defectTransitions: Record<DefectStatus, readonly DefectStatus[]> =
  {
    reported: ['triaged', 'deferred', 'cancelled'],
    triaged: ['assigned', 'deferred', 'cancelled'],
    assigned: ['correction_in_progress', 'deferred', 'cancelled'],
    correction_in_progress: ['ready_for_verification'],
    ready_for_verification: ['verified', 'correction_in_progress'],
    verified: ['closed'],
    closed: ['reopened'],
    reopened: ['assigned'],
    deferred: ['triaged', 'cancelled'],
    cancelled: [],
  };
