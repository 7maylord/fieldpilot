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

import { capabilitiesForRole } from '../src/lib/defect-status';
// Deliberate, test-only exception to "no backend source in frontend": this
// import never ships (capability.ts has zero external deps and this file
// only runs under vitest, never `next build`) and it's the only way to
// actually prove the hand-written mirror below hasn't drifted, rather than
// asserting it against a second hand-written copy of itself.
import { roleCapabilities as backendRoleCapabilities } from '../../backend/src/authorization/capability';

describe('capabilitiesForRole', () => {
  it('matches the backend capability table for every role', () => {
    for (const role of Object.keys(backendRoleCapabilities))
      expect([...capabilitiesForRole(role, false)].sort()).toEqual(
        [...backendRoleCapabilities[role]!].sort(),
      );
  });

  it('grants defect creation to members', () => {
    expect(capabilitiesForRole('member', false)).toContain('defects.create');
  });

  it('denies defect creation to viewers', () => {
    expect(capabilitiesForRole('viewer', false)).not.toContain(
      'defects.create',
    );
  });

  it('denies assignment to members', () => {
    expect(capabilitiesForRole('member', false)).not.toContain(
      'defects.assign',
    );
  });

  it('treats external members as the external role regardless of stored role', () => {
    expect(capabilitiesForRole('admin', true)).not.toContain(
      'organization.manage',
    );
    expect(capabilitiesForRole('admin', true)).toContain('defects.create');
  });

  it('denies unknown roles', () => {
    expect(capabilitiesForRole('robot', false)).toEqual([]);
  });
});
