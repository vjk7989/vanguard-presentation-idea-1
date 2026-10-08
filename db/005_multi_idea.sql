-- Additive upgrade: existing reserve runs and event hashes remain untouched.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS active_idea smallint NOT NULL DEFAULT 1;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS idea_key smallint NOT NULL DEFAULT 1;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS workflow_state jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS run_status text NOT NULL DEFAULT 'active';
UPDATE runs SET run_status='ended' WHERE ended_at IS NOT NULL AND run_status <> 'ended';
UPDATE runs r SET run_status=room.status FROM rooms room WHERE room.active_run_id=r.id;
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_active_idea_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_active_idea_check CHECK (active_idea BETWEEN 1 AND 4);
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_idea_key_check;
ALTER TABLE runs ADD CONSTRAINT runs_idea_key_check CHECK (idea_key BETWEEN 1 AND 4);
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_run_status_check;
ALTER TABLE runs ADD CONSTRAINT runs_run_status_check CHECK (run_status IN ('lobby','active','paused','ended'));
CREATE INDEX IF NOT EXISTS runs_room_idea_latest_idx ON runs(room_id, idea_key, run_number DESC);

ALTER TABLE role_claims ADD COLUMN IF NOT EXISTS idea_key smallint NOT NULL DEFAULT 1;
ALTER TABLE role_claims DROP CONSTRAINT IF EXISTS role_claims_pkey;
ALTER TABLE role_claims DROP CONSTRAINT IF EXISTS role_claims_room_id_session_id_key;
ALTER TABLE role_claims DROP CONSTRAINT IF EXISTS role_claims_room_idea_session_key;
ALTER TABLE role_claims DROP CONSTRAINT IF EXISTS role_claims_role_check;
ALTER TABLE role_claims DROP CONSTRAINT IF EXISTS role_claims_idea_check;
ALTER TABLE role_claims ADD CONSTRAINT role_claims_idea_check CHECK (idea_key BETWEEN 1 AND 4);
ALTER TABLE role_claims ADD CONSTRAINT role_claims_role_check CHECK (role IN (
  'issuer','fund','bank','portfolio','lending','broker_a','broker_b','custody',
  'hedge','dealer','paying_bank','accounting','pension','tax_compliance','depositary'
));
ALTER TABLE role_claims ADD CONSTRAINT role_claims_pkey PRIMARY KEY (room_id, idea_key, role);
ALTER TABLE role_claims ADD CONSTRAINT role_claims_room_idea_session_key UNIQUE (room_id, idea_key, session_id);
CREATE INDEX IF NOT EXISTS role_claims_session_idea_idx ON role_claims(session_id, idea_key);

CREATE TABLE IF NOT EXISTS practice_items (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  owner_role text NOT NULL,
  counterparty_role text NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','acknowledged','clarification_requested','responded','flagged','resolved')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, item_key)
);
CREATE INDEX IF NOT EXISTS practice_items_run_owner_idx ON practice_items(run_id, owner_role, status);
ALTER TABLE practice_items ENABLE ROW LEVEL SECURITY;

-- Give the existing DEMO01 reserve run supporting work without changing old events.
INSERT INTO practice_items (run_id,item_key,owner_role,counterparty_role,title,detail)
SELECT room.active_run_id, fixture.item_key, fixture.owner_role, fixture.counterparty_role, fixture.title, fixture.detail
FROM rooms room CROSS JOIN (VALUES
  ('issuer-payee-check','issuer','bank','Payee instruction review','Practice · verify a fictional holder reference.'),
  ('fund-liquidity-note','fund','issuer','Liquidity note','Practice · review a fictional redemption status.'),
  ('bank-trace-request','bank','issuer','Payment trace','Practice · answer a fictional bank reference query.')
) AS fixture(item_key,owner_role,counterparty_role,title,detail)
WHERE room.code='DEMO01' AND room.active_run_id IS NOT NULL
ON CONFLICT (run_id,item_key) DO NOTHING;
