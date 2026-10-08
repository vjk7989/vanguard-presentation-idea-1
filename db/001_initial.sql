CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY,
  code char(6) NOT NULL UNIQUE,
  scenario text NOT NULL DEFAULT 'friday_redemptions',
  status text NOT NULL CHECK (status IN ('lobby','active','paused','ended')),
  mode text NOT NULL CHECK (mode IN ('conventional','ledger')),
  revision bigint NOT NULL DEFAULT 0,
  active_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  run_number integer NOT NULL,
  step integer NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 6),
  payout_approved boolean NOT NULL DEFAULT false,
  bank_delayed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  UNIQUE (room_id, run_number)
);
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_active_run_id_fkey;
ALTER TABLE rooms ADD CONSTRAINT rooms_active_run_id_fkey FOREIGN KEY (active_run_id) REFERENCES runs(id);
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('presenter','participant')),
  join_run_id uuid REFERENCES runs(id) ON DELETE SET NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS join_run_id uuid REFERENCES runs(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS role_claims (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('issuer','fund','bank')),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, role),
  UNIQUE (room_id, session_id)
);
CREATE TABLE IF NOT EXISTS financial_states (
  run_id uuid PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  cash_minor bigint NOT NULL CHECK (cash_minor >= 0),
  fund_minor bigint NOT NULL CHECK (fund_minor >= 0),
  pending_minor bigint NOT NULL CHECK (pending_minor >= 0),
  obligations_minor bigint NOT NULL CHECK (obligations_minor >= 0)
);
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  event_index integer NOT NULL,
  type text NOT NULL,
  actor text NOT NULL,
  on_behalf_of text,
  label text NOT NULL,
  amount_minor bigint,
  reference text,
  previous_hash char(64) NOT NULL,
  event_hash char(64) NOT NULL,
  state_after jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (run_id, event_index),
  UNIQUE (run_id, event_hash)
);
CREATE INDEX IF NOT EXISTS events_room_run_idx ON events(room_id, run_id, event_index);
CREATE TABLE IF NOT EXISTS mutation_requests (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  run_id uuid NOT NULL,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, request_id)
);
CREATE INDEX IF NOT EXISTS rooms_expiry_idx ON rooms(expires_at);
CREATE TABLE IF NOT EXISTS room_creation_requests (
  request_id uuid PRIMARY KEY,
  room_id uuid NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
  response_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The browser never accesses these tables through Supabase's Data API.
-- The server connects to Postgres directly and performs all authorization.
-- RLS denies access to API roles without policies while the table owner can
-- continue to run the application's server-side transactions.
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_creation_requests ENABLE ROW LEVEL SECURITY;
