CREATE ROLE app_runtime LOGIN PASSWORD 'runtime' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;

CREATE TABLE work_orders (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    title TEXT NOT NULL
);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE ROW LEVEL SECURITY;

CREATE POLICY work_orders_org_policy ON work_orders
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::UUID)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::UUID);

GRANT SELECT, INSERT, UPDATE, DELETE ON work_orders TO app_runtime;

INSERT INTO work_orders (id, organization_id, title) VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Organization A work'),
  ('20000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Organization B work');
