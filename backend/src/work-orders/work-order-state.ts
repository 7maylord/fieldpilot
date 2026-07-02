import { BadRequestException } from '@nestjs/common';

export const workOrderStatuses = [
  'draft',
  'scheduled',
  'assigned',
  'accepted',
  'in_progress',
  'blocked',
  'submitted',
  'under_review',
  'completed',
  'cancelled',
] as const;
export type WorkOrderStatus = (typeof workOrderStatuses)[number];

const transitions: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['assigned', 'cancelled'],
  assigned: ['accepted', 'cancelled'],
  accepted: ['in_progress'],
  in_progress: ['blocked', 'submitted'],
  blocked: ['in_progress'],
  submitted: ['under_review'],
  under_review: ['completed', 'in_progress'],
  completed: [],
  cancelled: [],
};

export function assertWorkOrderTransition(from: string, to: WorkOrderStatus) {
  if (
    !workOrderStatuses.includes(from as WorkOrderStatus) ||
    !transitions[from as WorkOrderStatus].includes(to)
  ) {
    throw new BadRequestException(
      `Invalid work-order transition: ${from} -> ${to}`,
    );
  }
}
