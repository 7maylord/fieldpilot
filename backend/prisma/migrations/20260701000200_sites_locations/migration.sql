CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE sites (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  boundary GEOMETRY(Geometry, 4326),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, project_id, code),
  UNIQUE (id, organization_id, project_id)
);

CREATE TABLE locations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  site_id UUID NOT NULL,
  parent_id UUID,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL CHECK (location_type IN ('site', 'zone', 'building', 'floor', 'room', 'road_segment', 'chainage_section', 'structure', 'pipeline_segment', 'asset_location', 'gps_point', 'polygon')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  geometry GEOMETRY(Geometry, 4326),
  chainage_start NUMERIC,
  chainage_end NUMERIC,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id, project_id, site_id),
  FOREIGN KEY (site_id, organization_id, project_id) REFERENCES sites(id, organization_id, project_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id, organization_id, project_id, site_id) REFERENCES locations(id, organization_id, project_id, site_id) ON DELETE RESTRICT,
  CHECK (chainage_end IS NULL OR chainage_start IS NULL OR chainage_end >= chainage_start)
);

CREATE INDEX sites_organization_project_idx ON sites(organization_id, project_id);
CREATE INDEX sites_boundary_gist_idx ON sites USING GIST(boundary);
CREATE INDEX locations_organization_project_site_idx ON locations(organization_id, project_id, site_id);
CREATE INDEX locations_parent_id_idx ON locations(parent_id);
CREATE INDEX locations_geometry_gist_idx ON locations USING GIST(geometry);

GRANT SELECT, INSERT, UPDATE, DELETE ON sites, locations TO fieldpilot_runtime;

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sites
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON locations
USING (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid)
WITH CHECK (organization_id = NULLIF(current_setting('app.organization_id', true), '')::uuid);
