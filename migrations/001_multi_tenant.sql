-- MELORI Multi-Tenant Music Marketplace Schema Migration
-- Migration: 001_multi_tenant.sql

-- Create ENUM types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('artist', 'label_admin', 'platform_admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE address_type AS ENUM ('billing', 'shipping', 'business');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE storefront_member_role AS ENUM ('owner', 'manager', 'analyst');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payout_status AS ENUM ('pending', 'scheduled', 'paid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payout_frequency AS ENUM ('weekly', 'monthly');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Plans Table (must be created before users due to FK)
CREATE TABLE IF NOT EXISTS plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    price_monthly DECIMAL(10, 2),
    price_yearly DECIMAL(10, 2),
    commission_rate DECIMAL(5, 4) NOT NULL,
    max_storefronts INTEGER NOT NULL DEFAULT 1,
    max_uploads INTEGER,
    payout_frequency payout_frequency NOT NULL DEFAULT 'monthly',
    payout_minimum DECIMAL(10, 2) NOT NULL DEFAULT 10.00,
    stripe_price_id_monthly VARCHAR(255),
    stripe_price_id_yearly VARCHAR(255),
    features JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index on plan name for lookups
CREATE INDEX IF NOT EXISTS idx_plans_name ON plans(name);

-- Users Table (extended from existing)
CREATE TABLE IF NOT EXISTS users_mt (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'artist',
    plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL,
    stripe_customer_id VARCHAR(255),
    stripe_connect_account_id VARCHAR(255),
    onboarding_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_mt_email ON users_mt(email);
CREATE INDEX IF NOT EXISTS idx_users_mt_username ON users_mt(username);
CREATE INDEX IF NOT EXISTS idx_users_mt_plan_id ON users_mt(plan_id);
CREATE INDEX IF NOT EXISTS idx_users_mt_stripe_customer_id ON users_mt(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_mt_stripe_connect_account_id ON users_mt(stripe_connect_account_id);
CREATE INDEX IF NOT EXISTS idx_users_mt_role ON users_mt(role);

-- Addresses Table (support up to 10,000 per user)
CREATE TABLE IF NOT EXISTS addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users_mt(id) ON DELETE CASCADE,
    type address_type NOT NULL DEFAULT 'billing',
    is_default BOOLEAN DEFAULT FALSE,
    street VARCHAR(500) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for addresses
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_type ON addresses(type);
CREATE INDEX IF NOT EXISTS idx_addresses_is_default ON addresses(is_default);

-- Storefronts Table
CREATE TABLE IF NOT EXISTS storefronts (
    id SERIAL PRIMARY KEY,
    owner_user_id INTEGER NOT NULL REFERENCES users_mt(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    logo_url VARCHAR(500),
    banner_url VARCHAR(500),
    primary_color VARCHAR(7) DEFAULT '#FF5500',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for storefronts
CREATE INDEX IF NOT EXISTS idx_storefronts_owner_user_id ON storefronts(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_storefronts_slug ON storefronts(slug);
CREATE INDEX IF NOT EXISTS idx_storefronts_is_active ON storefronts(is_active);

-- Storefront Members Table (for label teams)
CREATE TABLE IF NOT EXISTS storefront_members (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users_mt(id) ON DELETE CASCADE,
    role storefront_member_role NOT NULL DEFAULT 'analyst',
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(storefront_id, user_id)
);

-- Indexes for storefront_members
CREATE INDEX IF NOT EXISTS idx_storefront_members_storefront_id ON storefront_members(storefront_id);
CREATE INDEX IF NOT EXISTS idx_storefront_members_user_id ON storefront_members(user_id);
CREATE INDEX IF NOT EXISTS idx_storefront_members_role ON storefront_members(role);

-- Albums Table (multi-tenant version)
CREATE TABLE IF NOT EXISTS albums_mt (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER REFERENCES storefronts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) DEFAULT 8.00,
    album_art VARCHAR(500) DEFAULT 'default.jpg',
    release_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users_mt(id) ON DELETE SET NULL
);

-- Indexes for albums
CREATE INDEX IF NOT EXISTS idx_albums_mt_storefront_id ON albums_mt(storefront_id);
CREATE INDEX IF NOT EXISTS idx_albums_mt_user_id ON albums_mt(user_id);
CREATE INDEX IF NOT EXISTS idx_albums_mt_is_active ON albums_mt(is_active);
CREATE INDEX IF NOT EXISTS idx_albums_mt_release_date ON albums_mt(release_date);

-- Songs Table (multi-tenant version)
CREATE TABLE IF NOT EXISTS songs_mt (
    id SERIAL PRIMARY KEY,
    album_id INTEGER REFERENCES albums_mt(id) ON DELETE CASCADE,
    storefront_id INTEGER REFERENCES storefronts(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    price DECIMAL(10, 2) DEFAULT 0.80,
    duration INTEGER,
    track_number INTEGER,
    play_count INTEGER DEFAULT 0,
    cover_art VARCHAR(500),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for songs
CREATE INDEX IF NOT EXISTS idx_songs_mt_album_id ON songs_mt(album_id);
CREATE INDEX IF NOT EXISTS idx_songs_mt_storefront_id ON songs_mt(storefront_id);
CREATE INDEX IF NOT EXISTS idx_songs_mt_track_number ON songs_mt(track_number);

-- Sales Table (multi-tenant version)
CREATE TABLE IF NOT EXISTS sales_mt (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER REFERENCES storefronts(id) ON DELETE SET NULL,
    album_id INTEGER REFERENCES albums_mt(id) ON DELETE SET NULL,
    song_id INTEGER REFERENCES songs_mt(id) ON DELETE SET NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL,
    type VARCHAR(10) CHECK (type IN ('album', 'song')),
    discount DECIMAL(5, 2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'completed',
    stripe_payment_intent_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for sales
CREATE INDEX IF NOT EXISTS idx_sales_mt_storefront_id ON sales_mt(storefront_id);
CREATE INDEX IF NOT EXISTS idx_sales_mt_album_id ON sales_mt(album_id);
CREATE INDEX IF NOT EXISTS idx_sales_mt_song_id ON sales_mt(song_id);
CREATE INDEX IF NOT EXISTS idx_sales_mt_customer_email ON sales_mt(customer_email);
CREATE INDEX IF NOT EXISTS idx_sales_mt_created_at ON sales_mt(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_mt_status ON sales_mt(status);

-- Transactions Table (commission tracking)
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES sales_mt(id) ON DELETE CASCADE,
    storefront_id INTEGER NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
    gross_amount DECIMAL(10, 2) NOT NULL,
    commission_amount DECIMAL(10, 2) NOT NULL,
    net_amount DECIMAL(10, 2) NOT NULL,
    commission_rate DECIMAL(5, 4) NOT NULL,
    stripe_transfer_id VARCHAR(255),
    payout_status payout_status NOT NULL DEFAULT 'pending',
    payout_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for transactions
CREATE INDEX IF NOT EXISTS idx_transactions_sale_id ON transactions(sale_id);
CREATE INDEX IF NOT EXISTS idx_transactions_storefront_id ON transactions(storefront_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payout_status ON transactions(payout_status);
CREATE INDEX IF NOT EXISTS idx_transactions_payout_date ON transactions(payout_date);
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_transfer_id ON transactions(stripe_transfer_id);

-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Traffic analytics (multi-tenant)
CREATE TABLE IF NOT EXISTS traffic_mt (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER REFERENCES storefronts(id) ON DELETE SET NULL,
    page_path VARCHAR(500),
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_traffic_mt_storefront_id ON traffic_mt(storefront_id);
CREATE INDEX IF NOT EXISTS idx_traffic_mt_created_at ON traffic_mt(created_at);

-- Search analytics (multi-tenant)
CREATE TABLE IF NOT EXISTS searches_mt (
    id SERIAL PRIMARY KEY,
    storefront_id INTEGER REFERENCES storefronts(id) ON DELETE SET NULL,
    query TEXT NOT NULL,
    result_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_searches_mt_storefront_id ON searches_mt(storefront_id);
CREATE INDEX IF NOT EXISTS idx_searches_mt_created_at ON searches_mt(created_at);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_users_mt_updated_at ON users_mt;
CREATE TRIGGER update_users_mt_updated_at
    BEFORE UPDATE ON users_mt
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_storefronts_updated_at ON storefronts;
CREATE TRIGGER update_storefronts_updated_at
    BEFORE UPDATE ON storefronts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_albums_mt_updated_at ON albums_mt;
CREATE TRIGGER update_albums_mt_updated_at
    BEFORE UPDATE ON albums_mt
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add constraint to ensure only one default address per type per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_addresses_one_default_per_type 
    ON addresses (user_id, type) 
    WHERE is_default = TRUE;
