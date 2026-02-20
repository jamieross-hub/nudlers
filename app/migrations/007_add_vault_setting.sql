-- Migration to add support for database-backed vault
-- NOTE: value is '""' (JSON empty string) so initialize.js can detect uninitialized vault with length > 0 check.
-- JSONB requires valid JSON; '' is invalid; '""' parses to empty string.
INSERT INTO app_settings (key, value, description) VALUES
  ('wrapped_master_key', '""', 'The master key wrapped with a passphrase for memory-locked credentials')
ON CONFLICT (key) DO NOTHING;
