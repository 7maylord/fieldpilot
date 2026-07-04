export type FormField = {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  options?: string[];
  visibleWhen?: {
    fieldId: string;
    operator: 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte';
    value: unknown;
  };
  min?: number;
  max?: number;
  target?: number;
  tolerance?: number;
  calculation?: {
    operator: 'sum' | 'difference' | 'product' | 'ratio';
    fieldIds: string[];
  };
  evidence?: {
    when: 'always' | 'failed';
    types: ('photo' | 'video' | 'file' | 'signature')[];
    minimum: number;
  };
};
export type FormSchema = {
  schemaVersion: 1;
  title: string;
  fields: FormField[];
};

export function evaluateForm(
  schema: FormSchema,
  input: Record<string, unknown>,
) {
  const answers = { ...input };
  const errors: Record<string, string[]> = {};
  const visible: Record<string, boolean> = {};
  const passed: Record<string, boolean | null> = {};
  const evidence: Record<string, FormField['evidence']> = {};
  for (const field of schema.fields) {
    visible[field.id] = field.visibleWhen
      ? compare(
          answers[field.visibleWhen.fieldId],
          field.visibleWhen.operator,
          field.visibleWhen.value,
        )
      : true;
    if (!visible[field.id]) continue;
    if (field.calculation)
      answers[field.id] = calculate(
        field.calculation.operator,
        field.calculation.fieldIds.map((id) => Number(answers[id])),
      );
    const answer = answers[field.id];
    if (field.required && empty(answer))
      (errors[field.id] ??= []).push('required');
    if (typeof answer === 'number') {
      if (field.min !== undefined && answer < field.min)
        (errors[field.id] ??= []).push('min');
      if (field.max !== undefined && answer > field.max)
        (errors[field.id] ??= []).push('max');
    }
    passed[field.id] =
      field.target === undefined ||
      field.tolerance === undefined ||
      typeof answer !== 'number'
        ? null
        : Math.abs(answer - field.target) <= field.tolerance;
    if (
      field.evidence &&
      (field.evidence.when === 'always' || passed[field.id] === false)
    )
      evidence[field.id] = field.evidence;
  }
  return {
    answers,
    visible,
    passed,
    evidence,
    errors,
    valid: !Object.keys(errors).length,
  };
}

function compare(
  left: unknown,
  operator: NonNullable<FormField['visibleWhen']>['operator'],
  right: unknown,
) {
  if (operator === 'equals') return left === right;
  if (operator === 'not_equals') return left !== right;
  if (typeof left !== 'number' || typeof right !== 'number') return false;
  if (operator === 'gt') return left > right;
  if (operator === 'gte') return left >= right;
  if (operator === 'lt') return left < right;
  return left <= right;
}

function calculate(
  operator: NonNullable<FormField['calculation']>['operator'],
  values: number[],
) {
  if (values.some((value) => !Number.isFinite(value))) return null;
  if (operator === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (operator === 'difference')
    return values.slice(1).reduce((total, value) => total - value, values[0]!);
  if (operator === 'product')
    return values.reduce((total, value) => total * value, 1);
  const result = values
    .slice(1)
    .reduce((total, value) => (value === 0 ? NaN : total / value), values[0]!);
  return Number.isFinite(result) ? result : null;
}

function empty(value: unknown) {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && !value.length)
  );
}
