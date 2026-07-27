'use client';

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { apiRequest } from '../lib/api';
import {
  evaluateForm,
  type FormField,
  type FormSchema,
} from '../lib/forms/schema';

type Version = {
  id: string;
  versionNumber: number;
  status: string;
  schema: FormSchema;
};
type Template = { id: string; name: string; versions: Version[] };
const emptySchema: FormSchema = {
  schemaVersion: 1,
  title: 'Untitled form',
  fields: [],
};
const addableTypes = [
  'text',
  'number',
  'boolean',
  'single_choice',
  'date',
  'photo',
  'signature',
] as const;

export function FormEditor({ organizationSlug }: { organizationSlug: string }) {
  const [organizationId, setOrganizationId] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('Inspection form');
  const [schema, setSchema] = useState<FormSchema>(emptySchema);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [newType, setNewType] = useState<(typeof addableTypes)[number]>('text');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const selected = templates.find(({ id }) => id === selectedId);
  const evaluation = useMemo(
    () => evaluateForm(schema, answers),
    [schema, answers],
  );

  async function load() {
    setLoading(true);
    try {
      const organizations =
        await apiRequest<{ id: string; slug: string }[]>('/organizations');
      const organization = organizations.find(
        ({ slug }) => slug === organizationSlug,
      );
      if (!organization) throw new Error('Organization not found');
      setOrganizationId(organization.id);
      const nextTemplates = await apiRequest<Template[]>(
        `/organizations/${organization.id}/form-templates`,
      );
      setTemplates(nextTemplates);
      if (
        !selectedId &&
        !schema.fields.length &&
        name === 'Inspection form' &&
        nextTemplates[0]
      )
        select(nextTemplates[0]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load().catch(() => setMessage('Unable to load form templates.'));
  }, [organizationSlug]);

  function reset() {
    setSelectedId('');
    setName('Inspection form');
    setSchema(emptySchema);
    setAnswers({});
  }

  function select(template: Template) {
    const version = template.versions[0];
    setSelectedId(template.id);
    setName(template.name);
    setSchema(version?.schema ?? emptySchema);
    setAnswers({});
  }

  function addField() {
    const id = `field_${schema.fields.length + 1}`;
    setSchema((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          id,
          type: newType,
          label: `Field ${current.fields.length + 1}`,
          ...(newType === 'single_choice' ? { options: ['Yes', 'No'] } : {}),
        },
      ],
    }));
  }

  function updateField(index: number, changes: Partial<FormField>) {
    setSchema((current) => ({
      ...current,
      fields: current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...changes } : field,
      ),
    }));
  }

  async function save() {
    const body = { name, schema: { ...schema, title: name } };
    if (selectedId)
      await apiRequest(
        `/organizations/${organizationId}/form-templates/${selectedId}/draft`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
        },
      );
    else {
      const created = await apiRequest<Template>(
        `/organizations/${organizationId}/form-templates`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
      );
      setSelectedId(created.id);
    }
    await load();
    setMessage('Draft saved.');
  }

  async function publish() {
    await apiRequest(
      `/organizations/${organizationId}/form-templates/${selectedId}/publish`,
      { method: 'POST' },
    );
    await load();
    setMessage('Published version is now immutable.');
  }

  async function duplicate() {
    await apiRequest(
      `/organizations/${organizationId}/form-templates/${selectedId}/duplicate`,
      {
        method: 'POST',
        body: JSON.stringify({ name: `${name} copy` }),
      },
    );
    await load();
    setMessage('Template duplicated as a draft.');
  }

  async function compareVersions() {
    const [latest, previous] = selected?.versions ?? [];
    if (!latest || !previous) return;
    const difference = await apiRequest<{
      added: string[];
      removed: string[];
      changed: string[];
    }>(
      `/organizations/${organizationId}/form-templates/versions/${previous.id}/compare?otherVersionId=${latest.id}`,
    );
    setMessage(
      `Version changes — added: ${difference.added.join(', ') || 'none'}; removed: ${difference.removed.join(', ') || 'none'}; changed: ${difference.changed.join(', ') || 'none'}.`,
    );
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Versioned forms</p>
          <h1>Form editor</h1>
        </div>
      </section>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="form-editor-grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Templates</h2>
            <button
              className="secondary small-button"
              type="button"
              onClick={reset}
            >
              New template
            </button>
          </div>
          {loading ? (
            <p>Loading templates…</p>
          ) : templates.length ? (
            <ul className="domain-list">
              {templates.map((template) => (
                <li key={template.id}>
                  <button
                    className={template.id === selectedId ? 'selected' : ''}
                    type="button"
                    onClick={() => select(template)}
                  >
                    <span>
                      <strong>{template.name}</strong>
                      <span>
                        v{template.versions[0]?.versionNumber ?? 1} ·{' '}
                        {template.versions[0]?.status ?? 'draft'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state compact-empty">
              <strong>No templates yet</strong>
              <span>Create the first reusable inspection form.</span>
            </div>
          )}
        </section>
        <section className="panel form-builder-panel">
          <h2>Builder</h2>
          <form className="project-form">
            <label>
              Form name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="form-add-row">
              <label>
                Field type
                <select
                  value={newType}
                  onChange={(event) =>
                    setNewType(event.target.value as typeof newType)
                  }
                >
                  {addableTypes.map((type) => (
                    <option value={type} key={type}>
                      {type.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" type="button" onClick={addField}>
                Add field
              </button>
            </div>
          </form>
          <div className="form-field-list">
            {schema.fields.map((field, index) => (
              <fieldset className="form-field-card" key={field.id}>
                <legend>{field.type.replaceAll('_', ' ')}</legend>
                <label>
                  Label
                  <input
                    value={field.label}
                    onChange={(event) =>
                      updateField(index, { label: event.target.value })
                    }
                  />
                </label>
                {field.type === 'single_choice' && (
                  <label>
                    Options
                    <input
                      value={(field.options ?? []).join(', ')}
                      onChange={(event) =>
                        updateField(index, {
                          options: event.target.value
                            .split(',')
                            .map((option) => option.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </label>
                )}
                <div className="form-field-actions">
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(event) =>
                        updateField(index, { required: event.target.checked })
                      }
                    />
                    Required
                  </label>
                  <button
                    className="secondary small-button"
                    type="button"
                    onClick={() =>
                      setSchema((current) => ({
                        ...current,
                        fields: current.fields.filter(
                          (_, item) => item !== index,
                        ),
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              </fieldset>
            ))}
            {!schema.fields.length && (
              <div className="empty-state compact-empty">
                <strong>No fields yet</strong>
                <span>Add the fields crews must complete in the field.</span>
              </div>
            )}
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="primary"
              onClick={() => void save()}
            >
              Save draft
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!selectedId}
              onClick={() => void publish()}
            >
              Publish
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!selectedId}
              onClick={() => void duplicate()}
            >
              Duplicate
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!selected || selected.versions.length < 2}
              onClick={() => void compareVersions()}
            >
              Compare versions
            </button>
          </div>
        </section>
        <section className="panel form-preview-panel">
          <h2>Preview</h2>
          <h3>{name}</h3>
          <div className="project-form">
            {schema.fields.map(
              (field) =>
                evaluation.visible[field.id] && (
                  <label key={field.id}>
                    {field.label}
                    {field.required ? ' *' : ''}
                    {previewControl(field, answers, setAnswers)}
                    {evaluation.errors[field.id]?.includes('required') && (
                      <span className="field-error" role="alert">
                        Required
                      </span>
                    )}
                  </label>
                ),
            )}
          </div>
          {!schema.fields.length && (
            <div className="empty-state compact-empty">
              <strong>Preview is empty</strong>
              <span>Add a field to see the field crew experience.</span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function previewControl(
  field: FormField,
  answers: Record<string, unknown>,
  setAnswers: Dispatch<SetStateAction<Record<string, unknown>>>,
) {
  if (field.type === 'boolean')
    return (
      <span className="check-row">
        <input
          type="checkbox"
          checked={Boolean(answers[field.id])}
          onChange={(event) =>
            setAnswers((current) => ({
              ...current,
              [field.id]: event.target.checked,
            }))
          }
        />
        Checked
      </span>
    );
  if (field.type === 'single_choice')
    return (
      <select
        value={String(answers[field.id] ?? '')}
        onChange={(event) =>
          setAnswers((current) => ({
            ...current,
            [field.id]: event.target.value,
          }))
        }
      >
        <option value="">Choose one</option>
        {(field.options ?? []).map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  return (
    <input
      type={
        field.type === 'number'
          ? 'number'
          : field.type === 'date'
            ? 'date'
            : field.type === 'photo' || field.type === 'signature'
              ? 'file'
              : 'text'
      }
      value={
        field.type === 'photo' || field.type === 'signature'
          ? undefined
          : String(answers[field.id] ?? '')
      }
      onChange={(event) =>
        setAnswers((current) => ({
          ...current,
          [field.id]:
            field.type === 'number'
              ? event.target.valueAsNumber
              : event.target.value,
        }))
      }
    />
  );
}
