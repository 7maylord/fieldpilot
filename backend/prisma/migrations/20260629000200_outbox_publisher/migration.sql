GRANT UPDATE (published_at) ON outbox_events TO fieldpilot_runtime;

CREATE FUNCTION app_pending_outbox_organizations()
RETURNS TABLE (organization_id UUID)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT organization_id
  FROM outbox_events
  WHERE published_at IS NULL;
$$;
REVOKE ALL ON FUNCTION app_pending_outbox_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_pending_outbox_organizations() TO fieldpilot_runtime;
