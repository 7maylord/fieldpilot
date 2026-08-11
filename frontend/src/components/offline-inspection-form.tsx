'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  defectSeedFromItem,
  saveDefectCapture,
  type DefectCaptureInput,
} from './field-defect-capture';
import { severities, severityLabel } from '../lib/defect-status';
import {
  evaluateForm,
  type FormField,
  type FormSchema,
} from '../lib/forms/schema';
import { db } from '../lib/offline/database';
import {
  saveInspectionDraft,
  type InspectionDraft,
} from '../lib/offline/inspections';
import { MediaCapture } from './media-capture';

export function OfflineInspectionForm({
  inspectionId,
}: {
  inspectionId: string;
}) {
  const [draft, setDraft] = useState<InspectionDraft>();
  const [schema, setSchema] = useState<FormSchema>();
  const [message, setMessage] = useState('');
  const [defectDraft, setDefectDraft] = useState<{
    fieldId: string;
    input: DefectCaptureInput;
  }>();
  const [defectError, setDefectError] = useState('');
  const [savingDefect, setSavingDefect] = useState(false);
  const [savedDefectFieldIds, setSavedDefectFieldIds] = useState<string[]>([]);
  const answers = draft?.answers ?? {};
  const visible = useMemo(() => {
    if (!schema) return {};
    const result: Record<string, boolean> = {};
    for (const field of schema.fields)
      result[field.id] =
        !field.visibleWhen ||
        answers[field.visibleWhen.fieldId] === field.visibleWhen.value;
    return result;
  }, [answers, schema]);
  const passed = useMemo(
    () => (schema ? evaluateForm(schema, answers).passed : {}),
    [answers, schema],
  );

  useEffect(() => {
    void (async () => {
      const stored = (await db.inspectionDrafts.get(inspectionId)) as
        InspectionDraft | undefined;
      if (!stored) return;
      const version = await db.formVersions.get(stored.formVersionId);
      setDraft({
        ...stored,
        answers:
          (stored.draftAnswers as Record<string, unknown>) ??
          stored.answers ??
          {},
      });
      setSchema(version?.schema as FormSchema | undefined);
    })();
  }, [inspectionId]);

  function answer(id: string, value: unknown) {
    setDraft((current) =>
      current
        ? { ...current, answers: { ...current.answers, [id]: value } }
        : current,
    );
  }

  function openDefectDraft(field: FormField) {
    if (!draft) return;
    setDefectError('');
    setDefectDraft({
      fieldId: field.id,
      input: defectSeedFromItem(
        { id: field.id, label: field.label },
        {
          projectId: String(draft.projectId ?? ''),
          inspectionId,
          locationId:
            typeof draft.locationId === 'string' ? draft.locationId : undefined,
        },
      ),
    });
  }

  async function saveDefect() {
    if (!draft || !defectDraft) return;
    setSavingDefect(true);
    try {
      await saveDefectCapture(defectDraft.input, draft.organizationId);
      setSavedDefectFieldIds((current) => [...current, defectDraft.fieldId]);
      setDefectDraft(undefined);
    } catch {
      setDefectError("Couldn't save this defect on your device. Try again.");
    } finally {
      setSavingDefect(false);
    }
  }

  async function persist(submit: boolean) {
    if (!draft || !schema) return;
    try {
      await saveInspectionDraft(draft, schema, submit);
      setMessage(
        submit
          ? 'Inspection queued for submission.'
          : 'Draft saved on this device.',
      );
    } catch {
      setMessage('Complete the required visible fields before submission.');
    }
  }

  if (!draft || !schema) return <p>No downloaded inspection was found.</p>;
  return (
    <section className="panel">
      <h1>{schema.title}</h1>
      {schema.fields.map(
        (field) =>
          visible[field.id] && (
            <div key={field.id}>
              <label>
                {field.label}
                {field.required ? ' *' : ''}
                {field.type === 'photo' || field.type === 'signature' ? (
                  <MediaCapture
                    type={field.type}
                    scope={{
                      organizationId: draft.organizationId,
                      projectId: String(draft.projectId ?? ''),
                      entityType: 'inspection',
                      entityId: draft.id,
                    }}
                    onCaptured={(id) =>
                      answer(`${field.id}_evidence`, [
                        ...((answers[`${field.id}_evidence`] as
                          string[] | undefined) ?? []),
                        id,
                      ])
                    }
                  />
                ) : field.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={Boolean(answers[field.id])}
                    onChange={(event) => answer(field.id, event.target.checked)}
                  />
                ) : field.type === 'single_choice' ? (
                  <select
                    value={String(answers[field.id] ?? '')}
                    onChange={(event) => answer(field.id, event.target.value)}
                  >
                    <option value="">Select</option>
                    {field.options?.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={
                      field.type === 'number' || field.type === 'measurement'
                        ? 'number'
                        : field.type === 'date'
                          ? 'date'
                          : field.type === 'time'
                            ? 'time'
                            : 'text'
                    }
                    value={String(answers[field.id] ?? '')}
                    onChange={(event) =>
                      answer(
                        field.id,
                        field.type === 'number' || field.type === 'measurement'
                          ? event.target.valueAsNumber
                          : event.target.value,
                      )
                    }
                  />
                )}
              </label>
              {passed[field.id] === false && (
                <div className="notice" role="alert">
                  {savedDefectFieldIds.includes(field.id) ? (
                    <span>Defect saved. It uploads when you reconnect.</span>
                  ) : defectDraft && defectDraft.fieldId === field.id ? (
                    <form
                      className="project-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveDefect();
                      }}
                    >
                      <label>
                        Title
                        <input
                          value={defectDraft.input.title}
                          onChange={(event) =>
                            setDefectDraft({
                              ...defectDraft,
                              input: {
                                ...defectDraft.input,
                                title: event.target.value,
                              },
                            })
                          }
                          required
                        />
                      </label>
                      <label>
                        Category
                        <input
                          value={defectDraft.input.category}
                          onChange={(event) =>
                            setDefectDraft({
                              ...defectDraft,
                              input: {
                                ...defectDraft.input,
                                category: event.target.value,
                              },
                            })
                          }
                          required
                        />
                      </label>
                      <label>
                        Severity
                        <select
                          value={defectDraft.input.severity}
                          onChange={(event) =>
                            setDefectDraft({
                              ...defectDraft,
                              input: {
                                ...defectDraft.input,
                                severity: event.target.value,
                              },
                            })
                          }
                        >
                          {severities.map((item) => (
                            <option key={item} value={item}>
                              {severityLabel(item)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Description
                        <textarea
                          value={defectDraft.input.description ?? ''}
                          onChange={(event) =>
                            setDefectDraft({
                              ...defectDraft,
                              input: {
                                ...defectDraft.input,
                                description: event.target.value,
                              },
                            })
                          }
                        />
                      </label>
                      {defectError && (
                        <p role="status" className="field-error">
                          {defectError}
                        </p>
                      )}
                      <button
                        className="primary"
                        type="submit"
                        disabled={savingDefect}
                      >
                        Save defect
                      </button>
                      <button
                        type="button"
                        onClick={() => setDefectDraft(undefined)}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <span>This item failed. Raise a defect?</span>
                      <button
                        type="button"
                        onClick={() => openDefectDraft(field)}
                      >
                        Raise a defect
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ),
      )}
      <label>
        Outcome
        <select
          value={draft.outcome ?? 'incomplete'}
          onChange={(event) =>
            setDraft({ ...draft, outcome: event.target.value })
          }
        >
          <option value="passed">Passed</option>
          <option value="passed_with_observations">
            Passed with observations
          </option>
          <option value="failed">Failed</option>
          <option value="incomplete">Incomplete</option>
          <option value="not_applicable">Not applicable</option>
        </select>
      </label>
      <div className="actions">
        <button type="button" onClick={() => void persist(false)}>
          Save offline
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => void persist(true)}
        >
          Submit when online
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
