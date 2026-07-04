import { evaluateForm, type FormSchema } from '../forms/schema';
import { db, type FieldPilotDatabase, type OfflineEntity } from './database';
import { createPendingOperation } from './repositories';

export type InspectionDraft = OfflineEntity & {
  formVersionId: string;
  answers: Record<string, unknown>;
  outcome?: string;
};

export async function saveInspectionDraft(
  draft: InspectionDraft,
  schema: FormSchema,
  submit = false,
  database: FieldPilotDatabase = db,
) {
  const evaluation = evaluateForm(schema, draft.answers);
  if (submit && !evaluation.valid)
    throw new Error('Inspection answers are invalid');
  const updated: InspectionDraft = {
    ...draft,
    answers: evaluation.answers,
    localUpdatedAt: new Date().toISOString(),
    syncState: 'pending',
  };
  const operation = createPendingOperation({
    organizationId: draft.organizationId,
    entityType: 'inspection',
    entityId: draft.id,
    action: submit ? 'form_submission_create' : 'update',
    baseVersion: draft.serverVersion,
    payload: {
      formVersionId: draft.formVersionId,
      answers: evaluation.answers,
      outcome: draft.outcome ?? 'incomplete',
    },
  });
  await database.transaction(
    'rw',
    database.inspectionDrafts,
    database.pendingOperations,
    async () => {
      await database.inspectionDrafts.put(updated);
      await database.pendingOperations
        .where('entityId')
        .equals(draft.id)
        .filter(
          (pending) =>
            pending.state === 'pending' &&
            (pending.action === 'update' || submit),
        )
        .delete();
      await database.pendingOperations.add(operation);
    },
  );
  return evaluation;
}
