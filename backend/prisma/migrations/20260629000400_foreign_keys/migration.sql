ALTER TABLE email_verification_tokens
  ADD CONSTRAINT email_verification_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE password_reset_tokens
  ADD CONSTRAINT password_reset_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE identity_outbox_events
  ADD CONSTRAINT identity_outbox_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE organization_invitations
  ADD CONSTRAINT organization_invitations_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE team_memberships
  ADD CONSTRAINT team_memberships_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  ADD CONSTRAINT team_memberships_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE project_access
  ADD CONSTRAINT project_access_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE outbox_events
  ADD CONSTRAINT outbox_events_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE job_executions
  ADD CONSTRAINT job_executions_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
