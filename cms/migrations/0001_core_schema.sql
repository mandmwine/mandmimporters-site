-- M&M Imports Catalog CMS: core schema (spec sections 15, 16, 25-29, 33)
-- Portable PostgreSQL. No vendor-specific extensions beyond pgcrypto.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Users and roles (spec 14). Passwords live in Firebase Auth, never here.
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid   text UNIQUE,
  email          text NOT NULL,
  display_name   text,
  role           text NOT NULL DEFAULT 'editor' CHECK (role IN ('admin', 'editor', 'viewer')),
  active         boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

-- ---------------------------------------------------------------------------
-- Assets (originals are never modified; derivatives point at their original)
-- ---------------------------------------------------------------------------
CREATE TABLE assets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind               text NOT NULL CHECK (kind IN ('bottle', 'map', 'logo', 'photo', 'document', 'pdf', 'other')),
  derivative         text NOT NULL DEFAULT 'original' CHECK (derivative IN ('original', 'web', 'print', 'thumb')),
  original_asset_id  uuid REFERENCES assets(id),
  storage_path       text NOT NULL,
  file_name          text,
  mime_type          text,
  width_px           integer,
  height_px          integer,
  bytes              bigint,
  checksum_sha256    text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by        uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX assets_original_idx ON assets (original_asset_id);

-- ---------------------------------------------------------------------------
-- Location hierarchy: Country > Region > Subregion > Appellation (spec 15.9, 22)
-- ---------------------------------------------------------------------------
CREATE TABLE locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   uuid REFERENCES locations(id),
  type        text NOT NULL CHECK (type IN ('country', 'region', 'subregion', 'appellation')),
  name        text NOT NULL,
  slug        text NOT NULL,
  aliases     text[] NOT NULL DEFAULT '{}',
  map_status  text NOT NULL DEFAULT 'needs_map' CHECK (map_status IN ('needs_map', 'draft', 'approved')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX locations_parent_name_idx ON locations (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX locations_parent_idx ON locations (parent_id);

CREATE TABLE map_assets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id  uuid NOT NULL REFERENCES locations(id),
  version      integer NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'retired')),
  geojson      jsonb,
  svg          text,
  asset_id     uuid REFERENCES assets(id),
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by  uuid REFERENCES users(id),
  approved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, version)
);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
CREATE TABLE grapes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  text NOT NULL,
  aliases         text[] NOT NULL DEFAULT '{}',
  color           text CHECK (color IN ('red', 'white', 'other')),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX grapes_name_idx ON grapes (lower(canonical_name));

CREATE TABLE critics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  text NOT NULL,
  short_label     text,
  publication     text,
  aliases         text[] NOT NULL DEFAULT '{}',
  logo_asset_id   uuid REFERENCES assets(id),
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX critics_name_idx ON critics (lower(canonical_name));

CREATE TABLE supervision_authorities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name  text NOT NULL,
  short_name      text,
  display_name    text,
  aliases         text[] NOT NULL DEFAULT '{}',
  region          text,
  logo_asset_id   uuid REFERENCES assets(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX supervision_name_idx ON supervision_authorities (lower(canonical_name));

-- ---------------------------------------------------------------------------
-- Producers, wines, vintages (spec 15.2-15.5)
-- ---------------------------------------------------------------------------
CREATE TABLE producers (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                         text NOT NULL,
  short_name                   text,
  slug                         text NOT NULL UNIQUE,
  country_location_id          uuid REFERENCES locations(id),
  primary_location_id          uuid REFERENCES locations(id),
  winery_summary_short         text,
  winery_story_long            text,
  website                      text,
  logo_asset_id                uuid REFERENCES assets(id),
  hero_asset_id                uuid REFERENCES assets(id),
  default_supervision_display  text,
  active                       boolean NOT NULL DEFAULT true,
  legacy                       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  deleted_at                   timestamptz
);
CREATE UNIQUE INDEX producers_name_idx ON producers (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE wines (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id            uuid NOT NULL REFERENCES producers(id),
  canonical_name         text NOT NULL,
  display_name           text,
  slug                   text NOT NULL UNIQUE,
  category               text CHECK (category IN ('red', 'white', 'rose', 'sparkling', 'dessert', 'fortified', 'orange', 'other')),
  primary_location_id    uuid REFERENCES locations(id),
  default_designation    text,
  bottle_family_default  text,
  website_slug           text,
  active                 boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);
CREATE INDEX wines_producer_idx ON wines (producer_id);

CREATE TABLE wine_vintages (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wine_id                  uuid NOT NULL REFERENCES wines(id),
  vintage_text             text,              -- '2022', 'NV'; NULL = not yet known (flagged)
  status                   text NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'needs_review', 'approved', 'published', 'discontinued')),
  display_title_override   text,
  location_id              uuid REFERENCES locations(id),
  mevushal                 text NOT NULL DEFAULT 'unknown' CHECK (mevushal IN ('yes', 'no', 'unknown')),
  supervision_display      text,
  aging_display            text,
  bottle_sizes             text[] NOT NULL DEFAULT '{}',
  special_designation      text,
  first_kosher_vintage     boolean,
  organic                  boolean,
  biodynamic               boolean,
  tasting_note             text,
  winery_note_override     text,
  wine_story               text,
  food_pairing             text,
  short_description        text,
  catalog_note             text,
  bottle_asset_id          uuid REFERENCES assets(id),
  bottle_family            text CHECK (bottle_family IN ('bordeaux', 'burgundy', 'sparkling', 'alsace', 'rhone', 'sculptural', 'half', 'magnum', 'other')),
  bottle_scale_override    numeric(5, 3),
  bottle_x_override        numeric(7, 2),
  bottle_y_override        numeric(7, 2),
  map_asset_override_id    uuid REFERENCES map_assets(id),
  theme_override           text,
  is_new                   boolean NOT NULL DEFAULT false,
  duplicated_from_id       uuid REFERENCES wine_vintages(id),
  carried_forward_fields   text[] NOT NULL DEFAULT '{}',
  legacy                   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- untouched imported values (spec 20.2 stage 2)
  reviewed_at              timestamptz,
  reviewed_by              uuid REFERENCES users(id),
  approved_at              timestamptz,
  approved_by              uuid REFERENCES users(id),
  published_at             timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX wine_vintages_wine_idx ON wine_vintages (wine_id);
CREATE INDEX wine_vintages_status_idx ON wine_vintages (status);
CREATE UNIQUE INDEX wine_vintages_unique_idx ON wine_vintages (wine_id, vintage_text)
  WHERE deleted_at IS NULL AND vintage_text IS NOT NULL;

CREATE TABLE wine_grapes (
  wine_vintage_id  uuid NOT NULL REFERENCES wine_vintages(id) ON DELETE CASCADE,
  grape_id         uuid NOT NULL REFERENCES grapes(id),
  percentage       numeric(5, 2) CHECK (percentage IS NULL OR (percentage > 0 AND percentage <= 100)),
  display_order    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (wine_vintage_id, grape_id)
);

CREATE TABLE wine_supervision (
  wine_vintage_id  uuid NOT NULL REFERENCES wine_vintages(id) ON DELETE CASCADE,
  authority_id     uuid NOT NULL REFERENCES supervision_authorities(id),
  display_order    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (wine_vintage_id, authority_id)
);

CREATE TABLE wine_assets (
  wine_vintage_id  uuid NOT NULL REFERENCES wine_vintages(id) ON DELETE CASCADE,
  asset_id         uuid NOT NULL REFERENCES assets(id),
  role             text NOT NULL DEFAULT 'bottle',
  PRIMARY KEY (wine_vintage_id, asset_id, role)
);

-- ---------------------------------------------------------------------------
-- Sources and field-level provenance (spec 16)
-- ---------------------------------------------------------------------------
CREATE TABLE sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type   text NOT NULL CHECK (source_type IN ('mm_catalog', 'mm_website', 'tech_sheet', 'producer_website',
                                                     'appellation_authority', 'critic_review', 'import_document',
                                                     'winery_correspondence', 'other')),
  title         text NOT NULL,
  url           text,
  asset_id      uuid REFERENCES assets(id),
  producer_id   uuid REFERENCES producers(id),
  published_on  date,
  added_by      uuid REFERENCES users(id),
  added_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wine_scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wine_vintage_id  uuid NOT NULL REFERENCES wine_vintages(id) ON DELETE CASCADE,
  critic_id        uuid REFERENCES critics(id),
  score_text       text NOT NULL,
  numeric_score    numeric(5, 2),
  score_low        numeric(5, 2),
  score_high       numeric(5, 2),
  award_text       text,
  review_year      integer,
  review_url       text,
  source_id        uuid REFERENCES sources(id),
  is_primary       boolean NOT NULL DEFAULT false,
  display_order    integer NOT NULL DEFAULT 0,
  raw_text         text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wine_scores_vintage_idx ON wine_scores (wine_vintage_id);

CREATE TABLE field_provenance (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type          text NOT NULL,      -- 'wine_vintage', 'wine', 'producer', ...
  entity_id            uuid NOT NULL,
  field_name           text NOT NULL,
  normalized_value     text,
  raw_value            text,
  source_id            uuid REFERENCES sources(id),
  source_locator       text,               -- page / section / slide
  verification_status  text NOT NULL DEFAULT 'unverified'
                         CHECK (verification_status IN ('unverified', 'verified', 'conflict', 'rejected')),
  is_current           boolean NOT NULL DEFAULT true,
  verified_at          timestamptz,
  verified_by          uuid REFERENCES users(id),
  notes                text,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX field_provenance_entity_idx ON field_provenance (entity_type, entity_id, field_name);

CREATE TABLE review_flags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  field_name   text,
  flag_type    text NOT NULL,   -- 'conflict', 'missing', 'stale', 'new_vintage', 'image', 'map', 'overflow', 'layout', 'duplicate', 'suspicious_change', 'legacy'
  severity     text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'error')),
  message      text NOT NULL,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_by  uuid REFERENCES users(id),
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX review_flags_entity_idx ON review_flags (entity_type, entity_id);
CREATE INDEX review_flags_open_idx ON review_flags (status, flag_type);

-- ---------------------------------------------------------------------------
-- Catalogs, immutable versions, exports (spec 25-27)
-- ---------------------------------------------------------------------------
CREATE TABLE catalogs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  season       text,
  status       text NOT NULL DEFAULT 'working' CHECK (status IN ('working', 'archived')),
  render_mode  text NOT NULL DEFAULT 'hybrid' CHECK (render_mode IN ('detailed', 'compact', 'hybrid')),
  cover_theme  text,
  settings     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  uuid NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  kind        text NOT NULL DEFAULT 'wines',   -- 'cover', 'intro', 'toc', 'regional_index', 'divider', 'producer_intro', 'wines', 'producer_index', 'contact', 'back_cover'
  title       text,
  position    integer NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE catalog_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id            uuid NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  section_id            uuid REFERENCES catalog_sections(id) ON DELETE SET NULL,
  wine_vintage_id       uuid NOT NULL REFERENCES wine_vintages(id),
  position              integer NOT NULL,
  render_mode_override  text,
  settings              jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX catalog_items_catalog_idx ON catalog_items (catalog_id, position);

CREATE TABLE catalog_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id        uuid NOT NULL REFERENCES catalogs(id),
  version_label     text NOT NULL,
  template_version  text NOT NULL,
  snapshot          jsonb NOT NULL,     -- everything needed to re-render exactly (spec 27.1)
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, version_label)
);

CREATE TABLE export_files (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id  uuid NOT NULL REFERENCES catalog_versions(id),
  preset              text NOT NULL CHECK (preset IN ('print', 'email', 'web')),
  status              text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'rendering', 'done', 'failed')),
  asset_id            uuid REFERENCES assets(id),
  error               text,
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE TABLE theme_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type  text NOT NULL CHECK (scope_type IN ('global', 'category', 'region')),
  scope_key   text NOT NULL,
  tokens      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_key)
);

-- ---------------------------------------------------------------------------
-- Audit trail and AI actions (spec 23, 29)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_events (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES users(id),
  action       text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  field_name   text,
  old_value    jsonb,
  new_value    jsonb,
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, created_at DESC);

CREATE TABLE ai_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES users(id),
  action       text NOT NULL,
  entity_type  text,
  entity_id    uuid,
  field_name   text,
  input        jsonb NOT NULL DEFAULT '{}'::jsonb,
  output       jsonb,
  model        text,
  status       text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'rejected', 'failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz
);

-- ---------------------------------------------------------------------------
-- Default theme (spec 9.2, 42). Editable later in Settings.
-- ---------------------------------------------------------------------------
INSERT INTO theme_tokens (scope_type, scope_key, tokens) VALUES
  ('global', 'default', '{"paper":"#F7F3EA","ink":"#1E1B18","rule":"#D9D1C2","accent":"#6E2335","metal":"#A88B57","mapLand":"#ECE5D6","mapHighlight":"#6E2335"}'),
  ('category', 'red', '{"accent":"#6E2335"}'),
  ('category', 'white', '{"accent":"#8A7A3C"}'),
  ('category', 'rose', '{"accent":"#B5646B"}'),
  ('category', 'sparkling', '{"accent":"#9C8350"}'),
  ('category', 'dessert', '{"accent":"#A36A1F"}');
