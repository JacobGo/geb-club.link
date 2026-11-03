-- 2026-11-02: copies of book cover images, served from /covers/<bookId> so pages
-- don't depend on Open Library / Penguin Random House being up.
CREATE TABLE cover_cache (
  book_id INTEGER PRIMARY KEY REFERENCES books_read(id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,       -- cover_url this copy was fetched from
  content_type TEXT NOT NULL,
  data BLOB NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
