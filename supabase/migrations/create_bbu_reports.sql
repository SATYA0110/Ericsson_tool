/*
# Create bbu_reports table (single-tenant, no auth)

1. New Tables
- `bbu_reports`: one row per BBU collection run.
  - `id` (uuid, primary key, auto-generated)
  - `site_name` (text) — label the user gave the site
  - `host` (text) — OAM IP/hostname of the BBU
  - `protocol` (text) — ssh or telnet
  - `username` (text) — login username used
  - `engineer` (text, nullable) — engineer name for the report header
  - `status` (text) — success, partial, or failed
  - `error` (text, nullable) — connection error message when the run failed
  - `results` (jsonb, nullable) — array of per-command results with raw output
  - `alarm_summary` (jsonb, nullable) — parsed critical/major/minor alarm counts
  - `created_at` (timestamptz)
2. Security
- Enable RLS on `bbu_reports`.
- This is a single-tenant tool with no sign-in, so all policies target
  `anon, authenticated` — the browser talks to the Data API with the anon key.
- Grant the anon/authenticated roles SELECT, INSERT, DELETE (history clearing)
  and service_role full access for the edge function's server-side writes.
*/

CREATE TABLE IF NOT EXISTS bbu_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name text NOT NULL,
  host text NOT NULL,
  protocol text NOT NULL,
  username text NOT NULL,
  engineer text,
  status text NOT NULL DEFAULT 'failed',
  error text,
  results jsonb,
  alarm_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bbu_reports ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON bbu_reports TO anon, authenticated;
GRANT ALL ON bbu_reports TO service_role;

DROP POLICY IF EXISTS "anon_select_reports" ON bbu_reports;
CREATE POLICY "anon_select_reports" ON bbu_reports
FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reports" ON bbu_reports;
CREATE POLICY "anon_insert_reports" ON bbu_reports
FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_reports" ON bbu_reports;
CREATE POLICY "anon_delete_reports" ON bbu_reports
FOR DELETE TO anon, authenticated USING (true);
