-- PostgreSQL does not index referencing columns automatically. These indexes
-- keep room expiry cascades and run/session lookups efficient as data grows.
CREATE INDEX IF NOT EXISTS rooms_active_run_id_idx ON rooms(active_run_id);
CREATE INDEX IF NOT EXISTS sessions_room_id_idx ON sessions(room_id);
CREATE INDEX IF NOT EXISTS sessions_join_run_id_idx ON sessions(join_run_id);
CREATE INDEX IF NOT EXISTS role_claims_session_id_idx ON role_claims(session_id);
