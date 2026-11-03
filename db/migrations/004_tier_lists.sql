-- 2026-11-02: per-member tier lists of club books. Lower position = further left = better.
CREATE TABLE tier_entries (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books_read(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('S', 'A', 'B', 'C', 'D', 'F')),
  position INTEGER NOT NULL,
  PRIMARY KEY (member_id, book_id)
);
