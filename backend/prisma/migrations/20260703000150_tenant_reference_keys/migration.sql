ALTER TABLE projects ADD CONSTRAINT projects_id_organization_id_key UNIQUE (id, organization_id);
ALTER TABLE form_versions ADD CONSTRAINT form_versions_id_organization_id_key UNIQUE (id, organization_id);
