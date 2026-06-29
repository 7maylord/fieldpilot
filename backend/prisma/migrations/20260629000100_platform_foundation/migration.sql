CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fieldpilot_runtime') THEN
    CREATE ROLE fieldpilot_runtime LOGIN PASSWORD 'fieldpilot_runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_verification_tokens_user_id_idx ON email_verification_tokens(user_id);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);

CREATE TABLE identity_outbox_events (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX identity_outbox_events_created_at_idx ON identity_outbox_events(created_at);

CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  is_external BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_memberships_user_id_idx ON organization_memberships(user_id);

CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organization_invitations_organization_id_idx ON organization_invitations(organization_id);

CREATE TABLE teams (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE team_memberships (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  team_id UUID NOT NULL,
  user_id UUID NOT NULL,
  UNIQUE (team_id, user_id)
);
CREATE INDEX team_memberships_organization_id_idx ON team_memberships(organization_id);

CREATE TABLE project_access (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  UNIQUE (project_id, user_id)
);
CREATE INDEX project_access_organization_id_idx ON project_access(organization_id);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID NOT NULL,
  request_id TEXT,
  summary JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_organization_id_occurred_at_idx ON audit_events(organization_id, occurred_at);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outbox_events_organization_id_created_at_idx ON outbox_events(organization_id, created_at);

CREATE TABLE job_executions (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  job_key TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, job_key)
);

GRANT USAGE ON SCHEMA public TO fieldpilot_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON users, sessions, email_verification_tokens, password_reset_tokens TO fieldpilot_runtime;
GRANT SELECT, INSERT, UPDATE ON identity_outbox_events TO fieldpilot_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations, organization_memberships, organization_invitations, teams, team_memberships, project_access, job_executions TO fieldpilot_runtime;
GRANT SELECT, INSERT ON audit_events, outbox_events TO fieldpilot_runtime;

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organization_memberships', 'organization_invitations', 'teams', 'team_memberships',
    'project_access', 'audit_events', 'outbox_events', 'job_executions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid) WITH CHECK (organization_id = NULLIF(current_setting(''app.organization_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END
$$;

CREATE POLICY tenant_isolation ON organizations
USING (id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

CREATE FUNCTION app_user_organizations(selected_user_id UUID)
RETURNS TABLE (organization_id UUID)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM organization_memberships
  WHERE user_id = selected_user_id AND status = 'active';
$$;
REVOKE ALL ON FUNCTION app_user_organizations(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_organizations(UUID) TO fieldpilot_runtime;
