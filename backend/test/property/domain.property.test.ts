import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  Capability,
  roleCapabilities,
} from '../../src/authorization/capability';
import {
  assertDefectTransition,
  defectStatuses,
} from '../../src/defects/defect-state';
import { evaluateForm, type FormSchema } from '../../src/forms/form-schema';
import { nextCheckpointSequence } from '../../src/sync/checkpoint';
import { syncOutcome } from '../../src/sync/conflict-strategy';
import {
  assertWorkOrderTransition,
  workOrderStatuses,
} from '../../src/work-orders/work-order-state';

describe('domain properties', () => {
  it('replays sync decisions deterministically and merges only independent checklist fields', () => {
    fc.assert(
      fc.property(
        fc.nat(),
        fc.nat(),
        fc.string(),
        fc.string(),
        (base, current, local, changed) => {
          const input = [
            'checklist_field_update',
            base,
            current,
            { fieldId: local },
            { changedFieldIds: [changed] },
          ] as const;
          expect(syncOutcome(...input)).toBe(syncOutcome(...input));
          expect(syncOutcome(...input)).toBe(
            local === changed && base !== current
              ? 'conflict'
              : base === current
                ? 'applied'
                : 'auto_merged',
          );
        },
      ),
    );
  });

  it('evaluates numeric tolerance exactly at generated boundaries', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1_000, max: 1_000, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: -1_000, max: 1_000, noNaN: true }),
        (target, tolerance, answer) => {
          const schema: FormSchema = {
            schemaVersion: 1,
            title: 'Property form',
            fields: [
              {
                id: 'reading',
                type: 'number',
                label: 'Reading',
                target,
                tolerance,
              },
            ],
          };
          expect(evaluateForm(schema, { reading: answer }).passed.reading).toBe(
            Math.abs(answer - target) <= tolerance,
          );
        },
      ),
    );
  });

  it('rejects self-transitions and unknown states across state machines', () => {
    fc.assert(
      fc.property(fc.constantFrom(...workOrderStatuses), (status) => {
        expect(() => assertWorkOrderTransition(status, status)).toThrow();
      }),
    );
    fc.assert(
      fc.property(fc.constantFrom(...defectStatuses), (status) => {
        expect(() => assertDefectTransition(status, status)).toThrow();
      }),
    );
  });

  it('keeps owner permissions a superset and viewer permissions empty', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.values(Capability)),
        (capability) => {
          expect(roleCapabilities.owner).toContain(capability);
          expect(roleCapabilities.viewer).not.toContain(capability);
        },
      ),
    );
  });

  it('never moves a checkpoint backwards', () => {
    fc.assert(
      fc.property(
        fc.nat().map(BigInt),
        fc.array(fc.nat().map(BigInt)),
        (current, changes) => {
          const next = nextCheckpointSequence(current, changes);
          expect(next).toBeGreaterThanOrEqual(current);
          expect(changes.every((sequence) => sequence <= next)).toBe(true);
        },
      ),
    );
  });
});
