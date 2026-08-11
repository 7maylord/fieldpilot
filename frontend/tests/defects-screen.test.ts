import { describe, expect, it } from 'vitest';
import { filterDefects, type Defect } from '../src/components/defects-screen';

const defect = (over: Partial<Defect>): Defect => ({
  id: crypto.randomUUID(),
  projectId: 'p',
  title: 't',
  category: 'quality',
  severity: 'high',
  status: 'reported',
  version: 1,
  assignments: [],
  corrections: [],
  statusEvents: [],
  ...over,
});

describe('filterDefects', () => {
  it('defaults to the states waiting on the office', () => {
    const rows = [
      defect({ status: 'reported' }),
      defect({ status: 'closed' }),
      defect({ status: 'ready_for_verification' }),
    ];
    expect(filterDefects(rows, 'Needs action', 'All')).toHaveLength(2);
  });

  it('filters by severity', () => {
    const rows = [
      defect({ severity: 'critical' }),
      defect({ severity: 'low' }),
    ];
    expect(filterDefects(rows, 'All', 'critical')).toHaveLength(1);
  });

  it('sorts critical first', () => {
    const rows = [
      defect({ severity: 'low' }),
      defect({ severity: 'critical' }),
    ];
    expect(filterDefects(rows, 'All', 'All')[0]!.severity).toBe('critical');
  });
});

import {
  availableActions,
  toggleEvidenceSelection,
} from '../src/components/defects-screen';

describe('availableActions', () => {
  it('offers correction only once a defect is in correction_in_progress, not merely assigned', () => {
    const inProgress = defect({ status: 'correction_in_progress' });
    expect(
      availableActions(inProgress, ['defects.create']).some(
        (a) => a.kind === 'correct',
      ),
    ).toBe(true);
    expect(
      availableActions(inProgress, []).some((a) => a.kind === 'correct'),
    ).toBe(false);
    expect(
      availableActions(defect({ status: 'assigned' }), ['defects.create']).some(
        (a) => a.kind === 'correct',
      ),
    ).toBe(false);
  });

  it('offers assignment only on triaged defects and only with the capability', () => {
    const triaged = defect({ status: 'triaged' });
    expect(
      availableActions(triaged, ['defects.assign']).some(
        (a) => a.kind === 'assign',
      ),
    ).toBe(true);
    expect(availableActions(triaged, []).some((a) => a.kind === 'assign')).toBe(
      false,
    );
    expect(
      availableActions(defect({ status: 'reported' }), ['defects.assign']).some(
        (a) => a.kind === 'assign',
      ),
    ).toBe(false);
  });

  it('offers verification only when ready and only with the capability', () => {
    const ready = defect({ status: 'ready_for_verification' });
    expect(
      availableActions(ready, ['defects.verify']).some(
        (a) => a.kind === 'verify',
      ),
    ).toBe(true);
    expect(availableActions(ready, []).some((a) => a.kind === 'verify')).toBe(
      false,
    );
  });

  it('offers no actions on a cancelled defect', () => {
    expect(
      availableActions(defect({ status: 'cancelled' }), [
        'defects.create',
        'defects.assign',
        'defects.verify',
      ]),
    ).toEqual([]);
  });

  it('never offers the verified transition as a plain status change without defects.verify', () => {
    const ready = defect({ status: 'ready_for_verification' });
    expect(
      availableActions(ready, ['defects.create']).some(
        (a) => a.kind === 'transition' && a.to === 'verified',
      ),
    ).toBe(false);
  });

  it('never offers the assigned transition as a plain status change, even with every capability', () => {
    const triaged = defect({ status: 'triaged' });
    expect(
      availableActions(triaged, [
        'defects.create',
        'defects.assign',
        'defects.verify',
      ]).some((a) => a.kind === 'transition' && a.to === 'assigned'),
    ).toBe(false);
  });

  it('does not offer the assigned transition on a triaged defect with no assignment yet', () => {
    const triaged = defect({ status: 'triaged', assignments: [] });
    expect(
      availableActions(triaged, ['defects.create']).some(
        (a) => a.kind === 'transition' && a.to === 'assigned',
      ),
    ).toBe(false);
  });

  it('offers the assigned transition on a reopened defect that already has an assignment', () => {
    const reopened = defect({
      status: 'reopened',
      assignments: [{ assigneeType: 'user', assigneeId: 'u1' }],
    });
    expect(
      availableActions(reopened, ['defects.create']).some(
        (a) => a.kind === 'transition' && a.to === 'assigned',
      ),
    ).toBe(true);
  });
});

describe('toggleEvidenceSelection', () => {
  it('builds evidenceIds from the reviewer checking items in the fetched evidence list', () => {
    let selected: string[] = [];
    selected = toggleEvidenceSelection(selected, 'media-1');
    selected = toggleEvidenceSelection(selected, 'media-2');
    expect(selected).toEqual(['media-1', 'media-2']);
  });

  it('unchecking a previously selected item removes only that id', () => {
    const selected = toggleEvidenceSelection(['media-1', 'media-2'], 'media-1');
    expect(selected).toEqual(['media-2']);
  });
});
