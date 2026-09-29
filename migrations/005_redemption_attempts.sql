-- Migration: Add redemption_attempts table for rate limiting
-- Created: 2026-01-01

CREATE TABLE IF NOT EXISTS redemption_attempts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    attempted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    was_successful BOOLEAN DEFAULT FALSE,
    keyword VARCHAR(50),
    code VARCHAR(20)
);

CREATE INDEX IF NOT EXISTS idx_redemption_attempts_email ON redemption_attempts(email);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_email_time ON redemption_attempts(email, attempted_at);
CREATE INDEX IF NOT EXISTS idx_redemption_attempts_ip ON redemption_attempts(ip_address);
