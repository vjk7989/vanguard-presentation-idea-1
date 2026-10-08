-- Existing runs are the original $200m / $50m-buffer demonstration.
-- New runs explicitly select scenario_version=2 in the application.
ALTER TABLE runs ADD COLUMN IF NOT EXISTS scenario_version smallint NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runs_scenario_version_check' AND conrelid = 'runs'::regclass) THEN
    ALTER TABLE runs ADD CONSTRAINT runs_scenario_version_check CHECK (scenario_version IN (1, 2));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS demo_cases (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 20),
  reference text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor IN (500000000, 1000000000, 2500000000)),
  status text NOT NULL CHECK (status IN ('opened', 'fund_reviewed', 'bank_acknowledged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, ordinal),
  UNIQUE (run_id, reference)
);
CREATE INDEX IF NOT EXISTS demo_cases_run_status_idx ON demo_cases(run_id, status, ordinal);
ALTER TABLE demo_cases ENABLE ROW LEVEL SECURITY;
