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

import { availableActions } from '../src/components/defects-screen';

describe('availableActions', () => {
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
});
