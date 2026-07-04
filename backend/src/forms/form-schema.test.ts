import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateForm,
  type FormSchema,
  validateFormSchema,
} from './form-schema';

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), '../fixtures/form-rules.json'), 'utf8'),
) as {
  schema: FormSchema;
  cases: {
    answers: Record<string, unknown>;
    expected: {
      valid: boolean;
      noteVisible: boolean;
      temperaturePassed: boolean;
      total: number;
      evidence: string[];
    };
  }[];
};

describe('form schema', () => {
  it('matches the shared form-rule conformance fixtures', () => {
    for (const testCase of fixture.cases) {
      const result = evaluateForm(fixture.schema, testCase.answers);
      expect({
        valid: result.valid,
        noteVisible: result.visible.note,
        temperaturePassed: result.passed.temperature,
        total: result.answers.total,
        evidence: Object.keys(result.evidence),
      }).toEqual(testCase.expected);
    }
  });

  it('rejects forward references so form evaluation cannot cycle', () => {
    expect(() =>
      validateFormSchema({
        schemaVersion: 1,
        title: 'Invalid',
        fields: [
          {
            id: 'first',
            type: 'text',
            label: 'First',
            visibleWhen: { fieldId: 'later', operator: 'equals', value: true },
          },
        ],
      }),
    ).toThrow(/earlier fields/);
  });
});
