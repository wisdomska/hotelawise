-- Constraints Drizzle can't express. Applied as a custom migration after the
-- generated schema (see drizzle/ journal). Every statement is idempotent.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. No double-booking, enforced by the database.
--    A hold is an allocation too, so holds take part in the constraint; the
--    allocating transaction deactivates expired holds first (DECISIONS D-13).
ALTER TABLE room_allocations
  ADD COLUMN IF NOT EXISTS stay daterange
  GENERATED ALWAYS AS (daterange(check_in, check_out, '[)')) STORED;

DO $$ BEGIN
  ALTER TABLE room_allocations
    ADD CONSTRAINT room_allocations_no_overlap
    EXCLUDE USING gist (room_id WITH =, stay WITH &&) WHERE (active);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE room_allocations ADD CONSTRAINT room_allocations_range_ck CHECK (check_out > check_in);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Sequences behind the public references (AW-, AWR-, EQ-). The app scrambles
--    nextval() with a keyed permutation so references can't be enumerated.
CREATE SEQUENCE IF NOT EXISTS booking_ref_seq START 1;
CREATE SEQUENCE IF NOT EXISTS rental_ref_seq START 1;
CREATE SEQUENCE IF NOT EXISTS enquiry_ref_seq START 1;
CREATE SEQUENCE IF NOT EXISTS payment_ref_seq START 1;

-- 3. There is always at least one active Super Admin.
CREATE OR REPLACE FUNCTION keep_one_super_admin() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'super_admin' AND NOT OLD.banned)
     OR (TG_OP = 'UPDATE' AND OLD.role = 'super_admin' AND NOT OLD.banned
         AND (NEW.role <> 'super_admin' OR NEW.banned)) THEN
    IF NOT EXISTS (
      SELECT 1 FROM "user"
      WHERE role = 'super_admin' AND NOT banned AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'last_super_admin' USING ERRCODE = 'P0001',
        HINT = 'There must always be at least one active Super Admin.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_keep_one_super_admin ON "user";
CREATE TRIGGER user_keep_one_super_admin
  BEFORE UPDATE OR DELETE ON "user"
  FOR EACH ROW EXECUTE FUNCTION keep_one_super_admin();

-- 4. Customers: one profile per phone; emails compared case-insensitively.
CREATE INDEX IF NOT EXISTS customers_email_lower_idx ON customers (lower(email));

-- 5. The audit log is append-only.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();
