-- 2026-11-02: member center. Profile links, favourite club book, private want-to-read
-- list, and notes on past books (visible to all members).
ALTER TABLE members ADD COLUMN storygraph_url TEXT;
ALTER TABLE members ADD COLUMN goodreads_url TEXT;
ALTER TABLE members ADD COLUMN favorite_book_id INTEGER REFERENCES books_read(id) ON DELETE SET NULL;

CREATE TABLE want_to_read (
  id INTEGER PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  ol_key TEXT,
  cover_id INTEGER,
  year INTEGER,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX want_to_read_member ON want_to_read (member_id);

CREATE TABLE book_notes (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books_read(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (member_id, book_id)
);
