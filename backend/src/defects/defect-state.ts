import { BadRequestException } from '@nestjs/common';

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

const transitions: Record<DefectStatus, readonly DefectStatus[]> = {
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

export function assertDefectTransition(from: string, to: DefectStatus) {
  if (
    !defectStatuses.includes(from as DefectStatus) ||
    !transitions[from as DefectStatus].includes(to)
  )
    throw new BadRequestException(`Invalid defect transition: ${from} → ${to}`);
}
