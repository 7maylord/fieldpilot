import { describe, expect, it } from 'vitest';
import { filterDefects, type Defect } from '../src/components/defects-screen';

const defect = (over: Partial<Defect>): Defect => ({
  id: crypto.randomUUID(), projectId: 'p', title: 't', category: 'quality',
  severity: 'high', status: 'reported', version: 1,
  assignments: [], corrections: [], statusEvents: [], ...over,
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
    const rows = [defect({ severity: 'critical' }), defect({ severity: 'low' })];
    expect(filterDefects(rows, 'All', 'critical')).toHaveLength(1);
  });

  it('sorts critical first', () => {
    const rows = [defect({ severity: 'low' }), defect({ severity: 'critical' })];
    expect(filterDefects(rows, 'All', 'All')[0]!.severity).toBe('critical');
  });
});
