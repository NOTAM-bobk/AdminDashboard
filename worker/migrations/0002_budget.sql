ALTER TABLE leads ADD COLUMN value REAL NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS budget_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,             -- YYYY-MM
  type TEXT NOT NULL DEFAULT 'spending',  -- spending | made | lost
  label TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_budget_month ON budget_entries (month);
