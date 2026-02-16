-- Migration to add support for database-backed vault
INSERT INTO app_settings (key, value, description) VALUES
  ('wrapped_master_key', '""', 'The master key wrapped with a passphrase for memory-locked credentials')
ON CONFLICT (key) DO NOTHING;
