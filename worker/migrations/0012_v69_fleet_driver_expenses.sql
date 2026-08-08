-- V69: online-synced Driver Khata and own-truck expense register.
CREATE TABLE IF NOT EXISTS drivers(
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'CMP-MEERA',
  driver_name TEXT NOT NULL,
  mobile TEXT DEFAULT '',
  license_no TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,driver_name)
);

CREATE TABLE IF NOT EXISTS driver_ledger_entries(
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'CMP-MEERA',
  driver_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'GAVE',
  amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT DEFAULT 'CASH',
  reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS truck_expenses(
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'CMP-MEERA',
  truck_no TEXT NOT NULL,
  trip_id TEXT DEFAULT '',
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  payment_mode TEXT DEFAULT 'CASH',
  reference TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_driver_company_v69 ON drivers(company_id,driver_name);
CREATE INDEX IF NOT EXISTS idx_driver_ledger_v69 ON driver_ledger_entries(company_id,driver_id,entry_date);
CREATE INDEX IF NOT EXISTS idx_truck_expense_v69 ON truck_expenses(company_id,truck_no,expense_date);
