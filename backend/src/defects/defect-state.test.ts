import { describe, expect, it } from 'vitest';
import { assertDefectTransition } from './defect-state';

describe('defect state machine', () => {
  it('supports rejection and reopening but rejects skipped closure', () => {
    expect(() =>
      assertDefectTransition(
        'ready_for_verification',
        'correction_in_progress',
      ),
    ).not.toThrow();
    expect(() => assertDefectTransition('closed', 'reopened')).not.toThrow();
    expect(() => assertDefectTransition('reported', 'closed')).toThrow(
      'Invalid defect transition',
    );
  });
});
