import { describe, expect, it } from 'vitest';
import { parseDefectState } from '../scripts/generate-defect-status.mjs';

const fixture = `
export const defectStatuses = [
  'reported',
  'triaged',
  'cancelled',
] as const;
export type DefectStatus = (typeof defectStatuses)[number];

const transitions: Record<DefectStatus, readonly DefectStatus[]> = {
  reported: ['triaged', 'cancelled'],
  triaged: ['cancelled'],
  cancelled: [],
};
`;

describe('parseDefectState', () => {
  it('extracts every status in declaration order', () => {
    expect(parseDefectState(fixture).statuses).toEqual([
      'reported',
      'triaged',
      'cancelled',
    ]);
  });

  it('extracts each status’s allowed transitions', () => {
    expect(parseDefectState(fixture).transitions).toEqual({
      reported: ['triaged', 'cancelled'],
      triaged: ['cancelled'],
      cancelled: [],
    });
  });

  it('throws if the transitions table has a different row count than the statuses list', () => {
    const mismatched = fixture.replace('cancelled: [],\n', '');
    expect(() => parseDefectState(mismatched)).toThrow(/out of sync/);
  });

  it('throws if it cannot find the statuses list at all', () => {
    expect(() => parseDefectState('export const somethingElse = 1;')).toThrow(
      /defectStatuses/,
    );
  });
});

import { allowedTransitions, statusLabel } from '../src/lib/defect-status';

describe('defect status helpers', () => {
  it('offers no transitions from a terminal status', () => {
    expect(allowedTransitions('cancelled')).toEqual([]);
  });

  it('renders sentence-case labels', () => {
    expect(statusLabel('ready_for_verification')).toBe(
      'Ready for verification',
    );
    expect(statusLabel('correction_in_progress')).toBe(
      'Correction in progress',
    );
  });
});
