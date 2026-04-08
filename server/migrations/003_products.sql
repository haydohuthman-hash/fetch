-- Marketplace catalog products (Postgres). Apply manually or rely on server boot `CREATE TABLE IF NOT EXISTS`.
-- Prices are whole AUD integers (matches store `priceAud`).

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  title text NOT NULL,
  category text NOT NULL,
  price_aud integer NOT NULL CHECK (price_aud >= 0),
  compare_price_aud integer NULL,
  cost_price_aud integer NULL,
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  is_bundle boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}',
  stock_quantity integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_active ON products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_created ON products (created_at DESC);
