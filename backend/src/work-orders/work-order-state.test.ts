import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertWorkOrderTransition,
  type WorkOrderStatus,
} from './work-order-state';

const allowed: [WorkOrderStatus, WorkOrderStatus][] = [
  ['draft', 'scheduled'],
  ['draft', 'cancelled'],
  ['scheduled', 'assigned'],
  ['scheduled', 'cancelled'],
  ['assigned', 'accepted'],
  ['assigned', 'cancelled'],
  ['accepted', 'in_progress'],
  ['in_progress', 'blocked'],
  ['in_progress', 'submitted'],
  ['blocked', 'in_progress'],
  ['submitted', 'under_review'],
  ['under_review', 'completed'],
  ['under_review', 'in_progress'],
];

describe('work-order state machine', () => {
  it.each(allowed)(
    'allows %s -> %s because it is part of the approved workflow',
    (from, to) => {
      expect(() => assertWorkOrderTransition(from, to)).not.toThrow();
    },
  );

  it.each([
    ['draft', 'completed'],
    ['scheduled', 'completed'],
    ['in_progress', 'completed'],
    ['completed', 'in_progress'],
    ['cancelled', 'draft'],
    ['unknown', 'draft'],
  ] as [string, WorkOrderStatus][])(
    'rejects %s -> %s so callers cannot bypass domain rules',
    (from, to) => {
      expect(() => assertWorkOrderTransition(from, to)).toThrow(
        BadRequestException,
      );
    },
  );
});
