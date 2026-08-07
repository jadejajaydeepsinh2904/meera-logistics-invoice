-- V61 reference: safe/idempotent D1 repair
CREATE TABLE IF NOT EXISTS subscription_requests(
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  requested_plan_id TEXT NOT NULL,
  billing_cycle TEXT DEFAULT 'MONTHLY',
  status TEXT NOT NULL DEFAULT 'PENDING',
  notes TEXT DEFAULT '',
  requested_by TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscription_request_company_v61
ON subscription_requests(company_id,status,created_at);
