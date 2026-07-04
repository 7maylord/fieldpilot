export const fieldTypes = [
  'text',
  'number',
  'boolean',
  'single_choice',
  'multiple_choice',
  'date',
  'time',
  'gps',
  'measurement',
  'photo',
  'video',
  'file',
  'signature',
  'barcode',
  'drawing',
  'repeating_group',
  'calculated',
  'section',
  'instructions',
] as const;
const comparisons = new Set(['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte']);
const calculations = new Set(['sum', 'difference', 'product', 'ratio']);
const evidenceTypes = new Set(['photo', 'video', 'file', 'signature']);

type Comparison = 'equals' | 'not_equals' | 'gt' | 'gte' | 'lt' | 'lte';
export type FormField = {
  id: string;
  type: (typeof fieldTypes)[number];
  label: string;
  required?: boolean;
  options?: string[];
  visibleWhen?: { fieldId: string; operator: Comparison; value: unknown };
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
export type FormAnswers = Record<string, unknown>;

export function validateFormSchema(
  value: unknown,
): asserts value is FormSchema {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    typeof value.title !== 'string'
  )
    throw new Error('Form schema header is invalid');
  if (!Array.isArray(value.fields) || value.fields.length > 200)
    throw new Error('Form schema must contain at most 200 fields');
  const seen = new Set<string>();
  for (const raw of value.fields) {
    if (!isObject(raw)) throw new Error('Form field is invalid');
    const field = raw as FormField;
    if (
      !/^[a-z][a-z0-9_]{0,63}$/.test(String(field.id)) ||
      seen.has(field.id) ||
      !fieldTypes.includes(field.type) ||
      typeof field.label !== 'string' ||
      !field.label.trim()
    )
      throw new Error('Form field definition is invalid');
    for (const referencedId of [
      field.visibleWhen?.fieldId,
      ...(field.calculation?.fieldIds ?? []),
    ])
      if (referencedId && !seen.has(referencedId))
        throw new Error('Form fields may only reference earlier fields');
    if (
      ['single_choice', 'multiple_choice'].includes(field.type) &&
      (!field.options?.length ||
        new Set(field.options).size !== field.options.length)
    )
      throw new Error('Choice fields require unique options');
    if (
      field.type === 'calculated' &&
      (!field.calculation ||
        !calculations.has(field.calculation.operator) ||
        field.calculation.fieldIds.length < 1)
    )
      throw new Error('Calculated fields require inputs');
    if (field.visibleWhen && !comparisons.has(field.visibleWhen.operator))
      throw new Error('Visibility operator is invalid');
    if (
      field.tolerance !== undefined &&
      (field.target === undefined || field.tolerance < 0)
    )
      throw new Error('Tolerance requires a target and non-negative value');
    if (
      field.evidence &&
      (!['always', 'failed'].includes(field.evidence.when) ||
        !Number.isInteger(field.evidence.minimum) ||
        field.evidence.minimum < 1 ||
        !field.evidence.types.length ||
        field.evidence.types.some((type) => !evidenceTypes.has(type)))
    )
      throw new Error('Evidence rule is invalid');
    seen.add(field.id);
  }
}

export function evaluateForm(schema: FormSchema, input: FormAnswers) {
  validateFormSchema(schema);
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

function compare(left: unknown, operator: Comparison, right: unknown) {
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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
