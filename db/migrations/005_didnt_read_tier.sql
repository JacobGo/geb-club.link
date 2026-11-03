-- 2026-11-02: add the "didn't read" tier (N). SQLite can't alter a CHECK, so rebuild the table.
CREATE TABLE tier_entries_new (
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  book_id INTEGER NOT NULL REFERENCES books_read(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('S', 'A', 'B', 'C', 'D', 'F', 'N')),
  position INTEGER NOT NULL,
  PRIMARY KEY (member_id, book_id)
);
INSERT INTO tier_entries_new (member_id, book_id, tier, position)
  SELECT member_id, book_id, tier, position FROM tier_entries;
DROP TABLE tier_entries;
ALTER TABLE tier_entries_new RENAME TO tier_entries;
