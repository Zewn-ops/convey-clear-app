-- Migration 003: deal sync support
-- Run: ssh root@187.124.112.180 "docker exec -i conveyclear-postgres psql -U conveyclear -d conveyclear" < 003_deal_sync.sql

-- 1. New columns on matters
ALTER TABLE matters ADD COLUMN IF NOT EXISTS municipality        TEXT;
ALTER TABLE matters ADD COLUMN IF NOT EXISTS additional_services TEXT;
ALTER TABLE matters ADD COLUMN IF NOT EXISTS invoice_status      TEXT;

-- 2. New columns on clients (primary_cell already exists per schema; id_number + registration_no already exist)
-- Nothing needed — schema already has these.

-- 3. UNIQUE constraints for upsert idempotency (NULLs never conflict so existing NULL rows are safe)
-- IF NOT EXISTS not supported for ADD CONSTRAINT; safe to run once — will error if already exists
ALTER TABLE matters ADD CONSTRAINT matters_pipedrive_deal_id_unique UNIQUE (pipedrive_deal_id);
ALTER TABLE clients ADD CONSTRAINT clients_pipedrive_person_id_unique UNIQUE (pipedrive_person_id);

-- 4. Extend priority check to include urgent + whale (idempotent via drop-then-add)
ALTER TABLE matters DROP CONSTRAINT IF EXISTS matters_priority_check;
ALTER TABLE matters ADD CONSTRAINT matters_priority_check
  CHECK (priority IN ('priority', 'standard', 'emerging', 'complex', 'urgent', 'whale'));

-- 5. Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'matters' AND column_name IN ('municipality','additional_services','invoice_status')
ORDER BY column_name;

SELECT conname FROM pg_constraint
WHERE conrelid = 'matters'::regclass AND conname IN ('matters_pipedrive_deal_id_unique','matters_priority_check');

SELECT conname FROM pg_constraint
WHERE conrelid = 'clients'::regclass AND conname = 'clients_pipedrive_person_id_unique';
