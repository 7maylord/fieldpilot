import { describe, expect, it } from 'vitest';
import {
  buildDefectOperation,
  captureState,
  defectSeedFromItem,
} from '../src/components/field-defect-capture';

describe('buildDefectOperation', () => {
  const input = {
    projectId: 'project-1',
    category: 'safety',
    severity: 'critical',
    title: 'Loose plank',
    description: 'Bay 3',
    inspectionId: undefined,
    locationId: undefined,
  };

  it('uses one client-generated id for both the draft and the operation', () => {
    const { draft, operation } = buildDefectOperation(input, 'org-1');
    expect(operation.entityId).toBe(draft.id);
    expect(draft.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('emits an append-style create with no base version', () => {
    const { operation } = buildDefectOperation(input, 'org-1');
    expect(operation.entityType).toBe('defect');
    expect(operation.action).toBe('defect_create');
    expect(operation.baseVersion).toBeNull();
  });

  it('marks the draft as pending so the datum bar counts it', () => {
    const { draft } = buildDefectOperation(input, 'org-1');
    expect(draft.syncState).toBe('pending');
    expect(draft.tombstone).toBe(false);
  });

  it('omits empty optional links rather than sending nulls', () => {
    const { operation } = buildDefectOperation(input, 'org-1');
    expect(operation.payload).not.toHaveProperty('inspectionId');
    expect(operation.payload).not.toHaveProperty('locationId');
  });
});

describe('captureState', () => {
  it('reports a rejected defect as needing attention, not as synced', () => {
    expect(captureState({ syncState: 'pending' }, 'rejected')).toBe('rejected');
  });

  it('never reports synced while an operation is still pending', () => {
    expect(captureState({ syncState: 'pending' }, 'pending')).toBe('held');
  });

  it('reports synced only once the operation applied', () => {
    expect(captureState({ syncState: 'synced' }, 'applied')).toBe('synced');
  });
});

describe('defectSeedFromItem', () => {
  const context = { projectId: 'p1', inspectionId: 'i1', locationId: 'l1' };

  it('carries the inspection link through so the defect traces back', () => {
    const seed = defectSeedFromItem(
      { id: 'f1', label: 'Bearing condition' },
      context,
    );
    expect(seed.inspectionId).toBe('i1');
    expect(seed.projectId).toBe('p1');
    expect(seed.locationId).toBe('l1');
  });

  it('seeds the title from the failed item label', () => {
    const seed = defectSeedFromItem(
      { id: 'f1', label: 'Bearing condition' },
      context,
    );
    expect(seed.title).toBe('Bearing condition');
  });

  it('defaults to medium severity so the reporter makes a deliberate choice', () => {
    expect(defectSeedFromItem({ id: 'f1', label: 'x' }, context).severity).toBe(
      'medium',
    );
  });
});
