-- Marketplace entities (JSONB rows). The server also runs CREATE IF NOT EXISTS on boot
-- when FETCH_MARKETPLACE_STORE=postgres; keep this file for ops / manual apply.

CREATE TABLE IF NOT EXISTS marketplace_entities (
  collection text NOT NULL,
  entity_id text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY (collection, entity_id)
);
