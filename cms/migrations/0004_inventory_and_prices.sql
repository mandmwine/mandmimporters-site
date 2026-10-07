-- Phase 12: inventory + pricing fields on wine_vintages, plus a price-ladder table.
-- Driven by the owner's monthly xlsx files (inventory + price_posting).

ALTER TABLE wine_vintages
  ADD COLUMN IF NOT EXISTS sku                        text,
  ADD COLUMN IF NOT EXISTS pack_size                  int,       -- bottles per case (12 / 6 / 3 / 1)
  ADD COLUMN IF NOT EXISTS stock_cases_available      numeric(10, 2),
  ADD COLUMN IF NOT EXISTS stock_cases_allocated      numeric(10, 2),
  ADD COLUMN IF NOT EXISTS stock_cases_inbound        numeric(10, 2),
  ADD COLUMN IF NOT EXISTS stock_updated_at           timestamptz;

CREATE INDEX IF NOT EXISTS wine_vintages_sku_idx ON wine_vintages (lower(sku)) WHERE sku IS NOT NULL;

-- A per-vintage pricing ladder. Rows: FrontLine (list) + bulk discount tiers
-- 2cs / 3cs / 4cs / 5cs / 10cs / 25cs. Each tier has a case price and the
-- derived bottle price. min_cases is the threshold a buyer must hit for that
-- tier (frontline = 1).
CREATE TABLE IF NOT EXISTS wine_vintage_prices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vintage_id      uuid NOT NULL REFERENCES wine_vintages(id) ON DELETE CASCADE,
  tier            text NOT NULL CHECK (tier IN ('frontline', '2cs', '3cs', '4cs', '5cs', '10cs', '25cs')),
  min_cases       int NOT NULL,
  case_price      numeric(12, 2) NOT NULL,
  bottle_price    numeric(12, 2),
  currency        text NOT NULL DEFAULT 'USD',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vintage_id, tier)
);
CREATE INDEX IF NOT EXISTS wine_vintage_prices_vintage_idx ON wine_vintage_prices (vintage_id);
