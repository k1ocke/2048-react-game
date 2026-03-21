-- Add composite index for efficient getUserRank() user lookup
CREATE INDEX IF NOT EXISTS idx_scores_user_best ON scores (user_id, score DESC);
