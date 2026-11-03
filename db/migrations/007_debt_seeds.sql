-- 2026-11-02: starting debts (seeded from Piranesi scores, x/5). Members who join before
-- the first election closes also start at full attendance (handled in code).
CREATE TABLE debt_seeds (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  debt REAL NOT NULL,
  note TEXT
);
