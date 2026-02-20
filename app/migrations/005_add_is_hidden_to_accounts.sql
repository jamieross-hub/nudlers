-- Add is_hidden flag to card_ownership to allow users to hide duplicate or junk accounts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'card_ownership' AND column_name = 'is_hidden') THEN
    ALTER TABLE card_ownership ADD COLUMN is_hidden BOOLEAN DEFAULT false;
  END IF;
END $$;
