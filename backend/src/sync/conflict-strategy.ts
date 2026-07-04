const appendOperations = new Set([
  'comment_append',
  'media_append',
  'defect_create',
  'asset_create',
]);

export function syncOutcome(
  operationType: string,
  baseVersion: number | null | undefined,
  currentVersion: number | null,
  localValue: Record<string, unknown> = {},
  serverValue: Record<string, unknown> = {},
) {
  if (appendOperations.has(operationType)) return 'auto_merged' as const;
  if (currentVersion === null || baseVersion === currentVersion)
    return 'applied' as const;
  if (operationType === 'checklist_field_update') {
    const changed = Array.isArray(serverValue.changedFieldIds)
      ? serverValue.changedFieldIds
      : [];
    return typeof localValue.fieldId === 'string' &&
      !changed.includes(localValue.fieldId)
      ? ('auto_merged' as const)
      : ('conflict' as const);
  }
  return 'conflict' as const;
}
