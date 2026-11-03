-- 2026-11-02: official StoryGraph link and cover image for each book read.
-- Data lives in db/book_media.sql (run after this).
ALTER TABLE books_read ADD COLUMN storygraph_url TEXT;
ALTER TABLE books_read ADD COLUMN cover_url TEXT;
