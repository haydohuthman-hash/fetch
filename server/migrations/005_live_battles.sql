-- Live Battles data model
-- Supports: battle state, participants, scores, boosts, comments, results, seller stats

CREATE TABLE IF NOT EXISTS battles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode          text NOT NULL DEFAULT 'mixed' CHECK (mode IN ('sales','bidding','boost','mixed')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','live','ended','cancelled')),
  duration_ms   integer NOT NULL DEFAULT 300000,
  started_at    timestamptz,
  ends_at       timestamptz,
  viewer_count  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_participants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id     uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  seller_key    text NOT NULL,
  side          text NOT NULL CHECK (side IN ('a','b')),
  display_name  text NOT NULL DEFAULT '@seller',
  avatar        text NOT NULL DEFAULT '',
  rating        numeric(3,2),
  stream_url    text,
  featured_product_json jsonb,
  score         integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (battle_id, side)
);

CREATE TABLE IF NOT EXISTS battle_boosts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id     uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  viewer_id     text NOT NULL,
  viewer_name   text NOT NULL DEFAULT 'Viewer',
  side          text NOT NULL CHECK (side IN ('a','b')),
  tier          smallint NOT NULL CHECK (tier BETWEEN 1 AND 3),
  credits_cost  integer NOT NULL DEFAULT 0,
  points_added  integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id     uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  viewer_id     text NOT NULL,
  viewer_name   text NOT NULL DEFAULT 'Viewer',
  body          text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id       uuid NOT NULL UNIQUE REFERENCES battles(id) ON DELETE CASCADE,
  winner_id       text,
  winner_side     text CHECK (winner_side IN ('a','b')),
  is_tie          boolean NOT NULL DEFAULT false,
  score_a         integer NOT NULL DEFAULT 0,
  score_b         integer NOT NULL DEFAULT 0,
  total_boosts_a  integer NOT NULL DEFAULT 0,
  total_boosts_b  integer NOT NULL DEFAULT 0,
  total_bids_a    integer NOT NULL DEFAULT 0,
  total_bids_b    integer NOT NULL DEFAULT 0,
  total_sales_a   integer NOT NULL DEFAULT 0,
  total_sales_b   integer NOT NULL DEFAULT 0,
  reward_badge    text,
  reward_feed_boost_expires_at timestamptz,
  reward_credits  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS battle_seller_stats (
  seller_id       text PRIMARY KEY,
  total_battles   integer NOT NULL DEFAULT 0,
  wins            integer NOT NULL DEFAULT 0,
  losses          integer NOT NULL DEFAULT 0,
  ties            integer NOT NULL DEFAULT 0,
  current_streak  integer NOT NULL DEFAULT 0,
  best_streak     integer NOT NULL DEFAULT 0,
  total_boosts_received integer NOT NULL DEFAULT 0,
  total_sales_in_battles integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_battle_participants_battle ON battle_participants(battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_boosts_battle ON battle_boosts(battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_comments_battle ON battle_comments(battle_id);
CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(status);
