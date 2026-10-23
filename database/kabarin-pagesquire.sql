-- Run once through npm run db:setup or the Supabase SQL Editor.
-- Only Kabarin-owned objects are created/changed. No public/auth/other app tables.
BEGIN;
CREATE SCHEMA IF NOT EXISTS kabarin_pagesquire;
CREATE TABLE IF NOT EXISTS kabarin_pagesquire.sessions (
  app_id text NOT NULL,
  session_key text NOT NULL,
  payload jsonb,
  expires_at timestamptz NOT NULL,
  lock_owner text,
  locked_until timestamptz,
  PRIMARY KEY (app_id,session_key),
  CHECK (length(app_id) BETWEEN 1 AND 160),
  CHECK (session_key ~ '^[a-f0-9]{64}$'),
  CHECK ((lock_owner IS NULL) = (locked_until IS NULL)),
  CHECK (payload IS NULL OR (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=2200000))
);
CREATE TABLE IF NOT EXISTS kabarin_pagesquire.rate_limits (
  app_id text NOT NULL,
  bucket_key text NOT NULL,
  request_count integer NOT NULL CHECK (request_count>0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (app_id,bucket_key),
  CHECK (length(app_id) BETWEEN 1 AND 160),
  CHECK (bucket_key ~ '^[a-f0-9]{64}$')
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON kabarin_pagesquire.sessions(app_id,expires_at);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON kabarin_pagesquire.rate_limits(app_id,expires_at);
ALTER TABLE kabarin_pagesquire.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kabarin_pagesquire.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA kabarin_pagesquire FROM PUBLIC;
REVOKE ALL ON kabarin_pagesquire.sessions,kabarin_pagesquire.rate_limits FROM PUBLIC;
-- Supabase may assign default grants to its API roles. Remove them on these objects only.
DO $kabarin$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA kabarin_pagesquire FROM %I',role_name);
      EXECUTE format('REVOKE ALL ON kabarin_pagesquire.sessions,kabarin_pagesquire.rate_limits FROM %I',role_name);
    END IF;
  END LOOP;
END
$kabarin$;
COMMIT;
