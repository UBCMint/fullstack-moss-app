-- "Member since" on the profile page needs a creation timestamp.
ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
