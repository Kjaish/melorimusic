-- Checkout / Orders Tables

CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  order_type VARCHAR(50) NOT NULL,
  item_id VARCHAR(255),
  amount_total INTEGER NOT NULL,
  currency VARCHAR(10) DEFAULT 'usd',
  status VARCHAR(50) NOT NULL,
  stripe_checkout_session_id VARCHAR(255) UNIQUE,
  stripe_payment_intent_id VARCHAR(255),
  created_at BIGINT NOT NULL,
  updated_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_checkout_session ON orders(stripe_checkout_session_id);

CREATE TABLE IF NOT EXISTS entitlements (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  entitlement_type VARCHAR(50) NOT NULL,
  item_id VARCHAR(255) NOT NULL,
  order_id VARCHAR(255) NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at BIGINT NOT NULL,
  UNIQUE(user_id, entitlement_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_entitlements_user_id ON entitlements(user_id);

CREATE TABLE IF NOT EXISTS download_tokens (
  id VARCHAR(255) PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  entitlement_type VARCHAR(50) NOT NULL,
  item_id VARCHAR(255) NOT NULL,
  order_id VARCHAR(255) NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_download_tokens_token ON download_tokens(token);
