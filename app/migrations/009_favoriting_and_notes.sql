-- Migration: Add favoriting and notes to transactions
-- Added: 2026-03-06

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS notes TEXT;

-- Index for favorited items to make filtering fast in the future
CREATE INDEX IF NOT EXISTS idx_transactions_is_favorite ON transactions(is_favorite) WHERE is_favorite = TRUE;
