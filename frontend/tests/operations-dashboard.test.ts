import { describe, expect, it } from 'vitest';
import {
  searchWork,
  type DashboardWorkOrder,
} from '../src/components/operations-dashboard';

const workOrders: DashboardWorkOrder[] = [
  {
    id: 'wo-1',
    title: 'Lekki borehole drilling',
    status: 'assigned',
    priority: 'high',
  },
  {
    id: 'wo-2',
    title: 'Ikoyi pile integrity test',
    status: 'submitted',
    priority: 'medium',
  },
  {
    id: 'wo-3',
    title: 'Victoria Island soil sampling',
    status: 'completed',
    priority: 'low',
  },
];

describe('operations dashboard search', () => {
  it('filters work by title, status, and priority', () => {
    expect(searchWork(workOrders, 'drilling').map(({ id }) => id)).toEqual([
      'wo-1',
    ]);
    expect(searchWork(workOrders, 'submitted').map(({ id }) => id)).toEqual([
      'wo-2',
    ]);
    expect(searchWork(workOrders, 'LOW').map(({ id }) => id)).toEqual(['wo-3']);
  });

  it('ignores surrounding whitespace and returns everything for blank search', () => {
    expect(searchWork(workOrders, '  ikoyi  ').map(({ id }) => id)).toEqual([
      'wo-2',
    ]);
    expect(searchWork(workOrders, '   ')).toEqual(workOrders);
  });
});
