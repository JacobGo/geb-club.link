-- GEB club schema (Cloudflare D1 / SQLite)
DROP TABLE IF EXISTS ballots;
DROP TABLE IF EXISTS candidates;
DROP TABLE IF EXISTS elections;
DROP TABLE IF EXISTS books_read;
DROP TABLE IF EXISTS members;

CREATE TABLE members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE, -- display label built from first_name/discord
  first_name TEXT,
  discord TEXT,
  pw_hash TEXT,        -- NULL = passwordless account
  pw_salt TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT
);

CREATE UNIQUE INDEX members_discord ON members (discord COLLATE NOCASE) WHERE discord IS NOT NULL;

CREATE TABLE books_read (
  id INTEGER PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  nominator TEXT,      -- free text: "none", "George/Jacob", ...
  read_date TEXT,      -- YYYY-MM or YYYY-MM-DD, often unknown
  notes TEXT,
  election_id INTEGER REFERENCES elections(id) ON DELETE SET NULL
);

CREATE TABLE elections (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'debt-star',
  status TEXT NOT NULL DEFAULT 'nominating' CHECK (status IN ('nominating', 'voting', 'closed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  winner_id INTEGER,
  result TEXT          -- JSON snapshot of the tally at close
);

CREATE TABLE candidates (
  id INTEGER PRIMARY KEY,
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  nominator_id INTEGER REFERENCES members(id),
  ol_key TEXT,         -- Open Library work key, e.g. /works/OL45804W
  cover_id INTEGER,
  isbn TEXT,
  year INTEGER,
  pitch TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ballots (
  election_id INTEGER NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id),
  scores TEXT NOT NULL, -- JSON {candidateId: 0..5}
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (election_id, member_id)
);
