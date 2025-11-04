-- Add sessions and frontend_state tables to store frontend data per session

CREATE TABLE IF NOT EXISTS sessions (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);


CREATE TABLE IF NOT EXISTS frontend_state (
  session_id INTEGER PRIMARY KEY
    REFERENCES sessions(id) ON DELETE CASCADE,
  data JSONB NOT NULL, -- store the required frontend state as JSON
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW() -- keep track of last update time
);
