import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateForm, type FormSchema } from '../src/lib/forms/schema';

const fixture = JSON.parse(
  readFileSync(
    new URL('../../fixtures/form-rules.json', import.meta.url),
    'utf8',
  ),
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
  it('matches the server conformance fixtures', () => {
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
});
