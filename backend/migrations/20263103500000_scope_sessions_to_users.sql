-- Scope sessions (and everything that hangs off them via ON DELETE CASCADE:
-- eeg_data, time_labels, frontend_state) to the user who owns them.

-- Existing rows are disposable dev/test data (unsaved placeholder sessions,
-- no real user accounts existed yet) — delete them rather than invent a seed
-- account, so user_id can go straight to NOT NULL below.
DELETE FROM sessions;

ALTER TABLE sessions ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE sessions ALTER COLUMN user_id SET NOT NULL;

-- Session names only need to be unique per user, not globally.
ALTER TABLE sessions DROP CONSTRAINT sessions_name_key;
ALTER TABLE sessions ADD CONSTRAINT sessions_user_id_name_key UNIQUE (user_id, name);
