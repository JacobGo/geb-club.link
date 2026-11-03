-- 2026-11-02: accounts have a first name and/or Discord handle; `name` is the display label.
ALTER TABLE members ADD COLUMN first_name TEXT;
ALTER TABLE members ADD COLUMN discord TEXT;
CREATE UNIQUE INDEX members_discord ON members (discord COLLATE NOCASE) WHERE discord IS NOT NULL;
