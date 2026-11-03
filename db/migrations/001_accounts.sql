-- 2026-11-02: replace seeded member list with self-created accounts.
-- Safe only while no candidates/ballots reference members.
DROP TABLE members;
CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pw_hash TEXT,
  pw_salt TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);
