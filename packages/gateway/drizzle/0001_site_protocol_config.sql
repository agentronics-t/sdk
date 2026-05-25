-- site_protocol_config holds per-site verifier configuration for the
-- enterprise auth protocols (sso, spiffe, mtls). google-agent reads from
-- the spiffe row's `googleTrustDomains` jsonb field — no separate row.
--
-- Apply with `drizzle-kit migrate` against the gateway DATABASE_URL, or
-- copy/paste into the Neon SQL editor. Idempotent.

CREATE TABLE IF NOT EXISTS "site_protocol_config" (
  "id" text PRIMARY KEY NOT NULL,
  "site_id" text NOT NULL,
  "protocol" text NOT NULL,
  "config" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_protocol_config_site_protocol_idx"
  ON "site_protocol_config" ("site_id", "protocol");
