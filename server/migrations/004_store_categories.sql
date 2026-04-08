-- Hierarchical store categories + product subcategory FK.
-- Server boot also runs equivalent CREATE/ALTER IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS store_categories (
  id text PRIMARY KEY,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id text NOT NULL REFERENCES store_categories(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_store_subcategories_category ON store_subcategories (category_id, sort_order);

ALTER TABLE products ADD COLUMN IF NOT EXISTS subcategory_id uuid;

DO $$
BEGIN
  ALTER TABLE products
    ADD CONSTRAINT products_subcategory_id_fkey
    FOREIGN KEY (subcategory_id) REFERENCES store_subcategories(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_subcategory ON products (subcategory_id);
