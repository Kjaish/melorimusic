-- Analytics and Promo Code System Migration
-- Adds tracking for traffic, clicks, time spent by email
-- Adds promo code campaigns and redemption system

-- Analytics Events Table (unified tracking)
CREATE TABLE IF NOT EXISTS analytics_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users_mt(id) ON DELETE SET NULL,
  email VARCHAR(255),
  session_id VARCHAR(100),
  event_type VARCHAR(50) NOT NULL, -- 'page_view', 'click', 'time_spent'
  page_path VARCHAR(500),
  target_element VARCHAR(255), -- for click tracking (button id, link, etc)
  target_id VARCHAR(100), -- optional: album_id, song_id, etc
  duration_ms INTEGER, -- for time_spent events
  metadata JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session Activity Table (for time spent tracking)
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users_mt(id) ON DELETE SET NULL,
  email VARCHAR(255),
  session_id VARCHAR(100) NOT NULL UNIQUE,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_duration_ms INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- Promo Campaigns Table
CREATE TABLE IF NOT EXISTS promo_campaigns (
  id SERIAL PRIMARY KEY,
  keyword VARCHAR(50) NOT NULL UNIQUE, -- e.g., 'MELORI', 'SUMMER2024'
  name VARCHAR(255) NOT NULL,
  description TEXT,
  reward_type VARCHAR(20) NOT NULL, -- 'album' or 'single'
  reward_item_id INTEGER, -- NULL means any item of that type
  expires_at TIMESTAMP,
  max_redemptions INTEGER DEFAULT 1000,
  current_redemptions INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users_mt(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Promo Codes Table (5-character codes)
CREATE TABLE IF NOT EXISTS promo_codes (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  code VARCHAR(5) NOT NULL, -- 5-character alphanumeric code
  status VARCHAR(20) DEFAULT 'active', -- 'active', 'redeemed', 'expired', 'disabled'
  redeemed_at TIMESTAMP,
  redeemed_by_user_id INTEGER REFERENCES users_mt(id) ON DELETE SET NULL,
  redeemed_by_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(campaign_id, code)
);

-- Promo Redemptions Audit Log
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id SERIAL PRIMARY KEY,
  promo_code_id INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  campaign_id INTEGER NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users_mt(id) ON DELETE SET NULL,
  email VARCHAR(255) NOT NULL,
  reward_type VARCHAR(20) NOT NULL,
  reward_item_id INTEGER,
  reward_item_title VARCHAR(255),
  ip_address VARCHAR(45),
  redeemed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prevent same email from redeeming same campaign twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_redemptions_email_campaign 
ON promo_redemptions(email, campaign_id);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_analytics_email ON analytics_events(email);
CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_session ON analytics_events(session_id);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_email ON user_sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON user_sessions(last_activity_at);

-- Indexes for promo codes
CREATE INDEX IF NOT EXISTS idx_promo_codes_status ON promo_codes(status);
CREATE INDEX IF NOT EXISTS idx_promo_codes_campaign ON promo_codes(campaign_id);

-- Analytics summary table for faster reporting (optional, for aggregated data)
CREATE TABLE IF NOT EXISTS analytics_daily_summary (
  id SERIAL PRIMARY KEY,
  summary_date DATE NOT NULL,
  email VARCHAR(255),
  total_page_views INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  total_time_spent_ms BIGINT DEFAULT 0,
  unique_pages INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(summary_date, email)
);
