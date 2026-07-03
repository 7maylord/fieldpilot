import { describe, expect, it } from 'vitest';
import { syncOutcome } from './conflict-strategy';

describe('syncOutcome', () => {
  it('merges independent append/create operations despite stale versions', () => {
    for (const operation of [
      'comment_append',
      'media_append',
      'defect_create',
      'asset_create',
      'form_submission_create',
    ])
      expect(syncOutcome(operation, 1, 4)).toBe('auto_merged');
    expect(
      syncOutcome(
        'checklist_field_update',
        1,
        4,
        { fieldId: 'safe' },
        { changedFieldIds: ['other'] },
      ),
    ).toBe('auto_merged');
    expect(
      syncOutcome(
        'checklist_field_update',
        1,
        4,
        { fieldId: 'same' },
        { changedFieldIds: ['same'] },
      ),
    ).toBe('conflict');
  });

  it('requires manual resolution for stale transitions and assignments', () => {
    expect(syncOutcome('status_transition', 1, 2)).toBe('conflict');
    expect(syncOutcome('assignment', 1, 2)).toBe('conflict');
  });
});
