CREATE TABLE IF NOT EXISTS demo_queue_items (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  role text NOT NULL CHECK (role IN ('issuer','fund','bank')),
  status text NOT NULL CHECK (status IN ('pending','complete')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, item_key)
);
CREATE INDEX IF NOT EXISTS demo_queue_run_role_idx ON demo_queue_items(run_id, role, status);
CREATE INDEX IF NOT EXISTS sessions_room_seen_idx ON sessions(room_id, last_seen_at DESC);
ALTER TABLE demo_queue_items ENABLE ROW LEVEL SECURITY;

-- Seed only the current run of the permanent demo room. Older runs retain their original history.
INSERT INTO demo_queue_items (run_id, item_key, role, status)
SELECT r.active_run_id, fixture.item_key, fixture.role, fixture.status
FROM rooms r
CROSS JOIN (VALUES
  ('iss-pay-01','issuer','pending'), ('iss-pay-02','issuer','pending'), ('iss-pay-03','issuer','complete'),
  ('fund-red-01','fund','pending'), ('fund-red-02','fund','pending'), ('fund-red-03','fund','complete'),
  ('bank-wire-01','bank','pending'), ('bank-pay-02','bank','pending'), ('bank-wire-03','bank','complete')
) AS fixture(item_key, role, status)
WHERE r.code = 'DEMO01' AND r.active_run_id IS NOT NULL
ON CONFLICT (run_id, item_key) DO NOTHING;
