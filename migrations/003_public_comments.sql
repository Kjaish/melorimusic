-- Public comments migration
-- Adds a table for public comments visible on the feedback page

CREATE TABLE IF NOT EXISTS public_comments (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_comments_created_at ON public_comments(created_at DESC);
