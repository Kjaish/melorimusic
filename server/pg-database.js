import pg from 'pg';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class PgDatabase {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });
  }

  async query(text, params) {
    try {
      return await this.pool.query(text, params);
    } catch (err) {
      console.error('Database query error:', err.message);
      throw err;
    }
  }

  async initialize() {
    console.log('Initializing PostgreSQL database...');
    await this.runMigrations();
    await this.seedPlans();
    await this.createDefaultAdmin();
    console.log('PostgreSQL database initialized successfully');
  }

  async runMigrations() {
    console.log('Running database migrations...');
    const migrationsDir = path.join(__dirname, '..', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const migrationName = file;

      // Check if migration already executed
      try {
        const result = await this.query(
          'SELECT id FROM schema_migrations WHERE migration_name = $1',
          [migrationName]
        );

        if (result.rows.length > 0) {
          console.log(`Migration ${migrationName} already executed, skipping...`);
          continue;
        }
      } catch (err) {
        // schema_migrations table might not exist yet, continue with migration
      }

      console.log(`Running migration: ${migrationName}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      try {
        await this.query(sql);

        // Record migration as executed
        await this.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT DO NOTHING',
          [migrationName]
        );

        console.log(`Migration ${migrationName} completed successfully`);
      } catch (err) {
        console.error(`Error running migration ${migrationName}:`, err.message);
        throw err;
      }
    }
  }

  async seedPlans() {
    console.log('Seeding plans table...');

    const plans = [
      {
        name: 'visitor',
        price_monthly: null,
        price_yearly: null,
        commission_rate: 0,
        max_storefronts: 0,
        max_uploads: 0,
        payout_frequency: 'none',
        payout_minimum: 0,
        features: JSON.stringify({
          listen: true,
          purchase: true,
          comment: true,
          review: true,
          upload: false
        })
      },
      {
        name: 'creator',
        price_monthly: null,
        price_yearly: null,
        commission_rate: 0.12,
        max_storefronts: 1,
        max_uploads: 100,
        payout_frequency: 'monthly',
        payout_minimum: 10.00,
        features: JSON.stringify({
          analytics: 'basic',
          support: 'community',
          customization: 'limited',
          watermark: true,
          upload: true
        })
      }
    ];

    for (const plan of plans) {
      try {
        await this.query(`
          INSERT INTO plans (
            name, price_monthly, price_yearly, commission_rate,
            max_storefronts, max_uploads, payout_frequency,
            payout_minimum, features
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (name) DO UPDATE SET
            price_monthly = EXCLUDED.price_monthly,
            price_yearly = EXCLUDED.price_yearly,
            commission_rate = EXCLUDED.commission_rate,
            max_storefronts = EXCLUDED.max_storefronts,
            max_uploads = EXCLUDED.max_uploads,
            payout_frequency = EXCLUDED.payout_frequency,
            payout_minimum = EXCLUDED.payout_minimum,
            features = EXCLUDED.features
        `, [
          plan.name,
          plan.price_monthly,
          plan.price_yearly,
          plan.commission_rate,
          plan.max_storefronts,
          plan.max_uploads,
          plan.payout_frequency,
          plan.payout_minimum,
          plan.features
        ]);
      } catch (err) {
        console.error(`Error seeding plan ${plan.name}:`, err.message);
      }
    }

    console.log('Plans seeded successfully');
  }

  async createDefaultAdmin() {
    try {
      const result = await this.query('SELECT COUNT(*) as count FROM users_mt');
      if (parseInt(result.rows[0].count) === 0) {
        // Use environment variable for admin password, or generate secure random password
        const adminPassword = process.env.ADMIN_PASSWORD || require('crypto').randomBytes(16).toString('hex');
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // Get the creator plan id
        const planResult = await this.query("SELECT id FROM plans WHERE name = 'creator'");
        const planId = planResult.rows[0]?.id;

        await this.query(`
          INSERT INTO users_mt (email, password_hash, username, role, plan_id, onboarding_complete)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, ['admin@example.com', hashedPassword, 'admin', 'platform_admin', planId, true]);

        if (process.env.ADMIN_PASSWORD) {
          console.log('Default admin user created with ADMIN_PASSWORD from environment');
        } else {
          console.log('Default admin user created with generated password:', adminPassword);
          console.log('IMPORTANT: Set ADMIN_PASSWORD environment variable for production!');
        }
      }
    } catch (err) {
      console.error('Error creating default admin:', err.message);
    }
  }

  // User methods
  async createUser(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const result = await this.query(`
      INSERT INTO users_mt (email, password_hash, username, role, plan_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [userData.email, hashedPassword, userData.username, userData.role || 'artist', userData.plan_id]);
    return result.rows[0].id;
  }

  async getUserByUsername(username) {
    const result = await this.query(
      'SELECT * FROM users_mt WHERE username = $1',
      [username]
    );
    return result.rows[0];
  }

  async getUserByEmail(email) {
    const result = await this.query(
      'SELECT * FROM users_mt WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  async getUserById(id) {
    const result = await this.query(
      'SELECT id, email, username, role, plan_id, stripe_customer_id, stripe_connect_account_id, onboarding_complete, created_at, avatar_url FROM users_mt WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  async updateUserAvatar(userId, avatarUrl) {
    const result = await this.query(
      'UPDATE users_mt SET avatar_url = $1 WHERE id = $2 RETURNING *',
      [avatarUrl, userId]
    );
    return result.rows[0];
  }

  async updateUser(id, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await this.query(
      `UPDATE users_mt SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async verifyUserPassword(userId, password) {
    const result = await this.query(
      'SELECT password_hash FROM users_mt WHERE id = $1',
      [userId]
    );
    if (!result.rows[0]) return false;
    return bcrypt.compare(password, result.rows[0].password_hash);
  }

  async updateUserCredentials(userId, username, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await this.query(
      'UPDATE users_mt SET username = $1, password_hash = $2 WHERE id = $3 RETURNING *',
      [username, hashedPassword, userId]
    );
    return result.rows[0];
  }

  // Address methods
  async createAddress(addressData) {
    // If setting as default, unset other defaults first
    if (addressData.is_default) {
      await this.query(
        'UPDATE addresses SET is_default = FALSE WHERE user_id = $1 AND type = $2',
        [addressData.user_id, addressData.type]
      );
    }

    const result = await this.query(`
      INSERT INTO addresses (user_id, type, is_default, street, city, state, postal_code, country)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      addressData.user_id,
      addressData.type,
      addressData.is_default || false,
      addressData.street,
      addressData.city,
      addressData.state,
      addressData.postal_code,
      addressData.country
    ]);
    return result.rows[0].id;
  }

  async getAddressesByUserId(userId, type = null) {
    let query = 'SELECT * FROM addresses WHERE user_id = $1';
    const params = [userId];

    if (type) {
      query += ' AND type = $2';
      params.push(type);
    }

    query += ' ORDER BY is_default DESC, created_at DESC';

    const result = await this.query(query, params);
    return result.rows;
  }

  async deleteAddress(id, userId) {
    const result = await this.query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  }

  // Plan methods
  async getAllPlans() {
    const result = await this.query('SELECT * FROM plans ORDER BY commission_rate DESC');
    return result.rows;
  }

  async getPlanById(id) {
    const result = await this.query('SELECT * FROM plans WHERE id = $1', [id]);
    return result.rows[0];
  }

  async getPlanByName(name) {
    const result = await this.query('SELECT * FROM plans WHERE name = $1', [name]);
    return result.rows[0];
  }

  // Storefront methods
  async createStorefront(data) {
    const result = await this.query(`
      INSERT INTO storefronts (owner_user_id, name, slug, description, logo_url, banner_url, primary_color)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      data.owner_user_id,
      data.name,
      data.slug,
      data.description,
      data.logo_url,
      data.banner_url,
      data.primary_color || '#FF5500'
    ]);
    return result.rows[0].id;
  }

  async getStorefrontById(id) {
    const result = await this.query('SELECT * FROM storefronts WHERE id = $1', [id]);
    return result.rows[0];
  }

  async getStorefrontBySlug(slug) {
    const result = await this.query('SELECT * FROM storefronts WHERE slug = $1', [slug]);
    return result.rows[0];
  }

  async getStorefrontsByUserId(userId) {
    const result = await this.query(`
      SELECT s.* FROM storefronts s
      WHERE s.owner_user_id = $1
      UNION
      SELECT s.* FROM storefronts s
      INNER JOIN storefront_members sm ON s.id = sm.storefront_id
      WHERE sm.user_id = $1 AND sm.accepted_at IS NOT NULL
      ORDER BY created_at DESC
    `, [userId]);
    return result.rows;
  }

  async updateStorefront(id, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await this.query(
      `UPDATE storefronts SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async deleteStorefront(id) {
    const result = await this.query('DELETE FROM storefronts WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async softDeleteStorefront(id) {
    const result = await this.query(
      'UPDATE storefronts SET is_active = FALSE WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async checkSlugExists(slug, excludeId = null) {
    let query = 'SELECT id FROM storefronts WHERE slug = $1';
    const params = [slug];

    if (excludeId) {
      query += ' AND id != $2';
      params.push(excludeId);
    }

    const result = await this.query(query, params);
    return result.rows.length > 0;
  }

  async getStorefrontAlbumsAndSingles(storefrontId) {
    const albums = await this.query(`
      SELECT a.*, COUNT(s.id) as song_count
      FROM albums_mt a
      LEFT JOIN songs_mt s ON a.id = s.album_id
      WHERE a.storefront_id = $1 AND a.is_active = TRUE
      GROUP BY a.id
      ORDER BY a.display_order ASC, a.created_at DESC
    `, [storefrontId]);

    const singles = await this.query(`
      SELECT * FROM songs_mt 
      WHERE storefront_id = $1 AND album_id IS NULL
      ORDER BY display_order ASC, created_at DESC
    `, [storefrontId]);

    return {
      albums: albums.rows,
      singles: singles.rows
    };
  }

  async getStorefrontWithOwner(slug) {
    const result = await this.query(`
      SELECT s.*, u.username as owner_username, u.email as owner_email
      FROM storefronts s
      INNER JOIN users_mt u ON s.owner_user_id = u.id
      WHERE s.slug = $1 AND s.is_active = TRUE
    `, [slug]);
    return result.rows[0];
  }

  // Storefront Member methods
  async addStorefrontMember(storefrontId, userId, role) {
    const result = await this.query(`
      INSERT INTO storefront_members (storefront_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (storefront_id, user_id) DO UPDATE SET role = $3
      RETURNING id
    `, [storefrontId, userId, role]);
    return result.rows[0].id;
  }

  async acceptStorefrontInvite(storefrontId, userId) {
    const result = await this.query(`
      UPDATE storefront_members SET accepted_at = CURRENT_TIMESTAMP
      WHERE storefront_id = $1 AND user_id = $2
      RETURNING id
    `, [storefrontId, userId]);
    return result.rowCount > 0;
  }

  async removeStorefrontMember(storefrontId, userId) {
    const result = await this.query(
      'DELETE FROM storefront_members WHERE storefront_id = $1 AND user_id = $2',
      [storefrontId, userId]
    );
    return result.rowCount > 0;
  }

  async getStorefrontMembers(storefrontId) {
    const result = await this.query(`
      SELECT sm.*, u.email, u.username
      FROM storefront_members sm
      INNER JOIN users_mt u ON sm.user_id = u.id
      WHERE sm.storefront_id = $1
      ORDER BY sm.role, sm.invited_at
    `, [storefrontId]);
    return result.rows;
  }

  // Album methods (multi-tenant)
  async createAlbum(albumData) {
    const result = await this.query(`
      INSERT INTO albums_mt (storefront_id, title, description, price, album_art, release_date, user_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      albumData.storefront_id,
      albumData.title,
      albumData.description,
      albumData.price || 8.00,
      albumData.album_art || 'default.jpg',
      albumData.release_date,
      albumData.user_id
    ]);
    return result.rows[0].id;
  }

  async getAlbumById(id) {
    const result = await this.query(
      'SELECT * FROM albums_mt WHERE id = $1 AND is_active = TRUE',
      [id]
    );
    return result.rows[0];
  }

  async getAlbumsByStorefrontId(storefrontId) {
    const result = await this.query(`
      SELECT a.*, COUNT(s.id) as song_count
      FROM albums_mt a
      LEFT JOIN songs_mt s ON a.id = s.album_id
      WHERE a.storefront_id = $1 AND a.is_active = TRUE
      GROUP BY a.id
      ORDER BY a.display_order ASC, a.created_at DESC
    `, [storefrontId]);
    return result.rows;
  }

  async updateAlbum(id, data) {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && key !== 'id') {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await this.query(
      `UPDATE albums_mt SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async deleteAlbum(id) {
    const result = await this.query(
      'UPDATE albums_mt SET is_active = FALSE WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  // Song methods (multi-tenant)
  async createSong(songData) {
    const result = await this.query(`
      INSERT INTO songs_mt (album_id, storefront_id, title, file_path, price, duration, track_number, cover_art)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      songData.album_id,
      songData.storefront_id,
      songData.title,
      songData.file_path,
      songData.price || 0.99,
      songData.duration,
      songData.track_number,
      songData.cover_art
    ]);
    return result.rows[0].id;
  }

  async getSongById(id) {
    const result = await this.query('SELECT * FROM songs_mt WHERE id = $1', [id]);
    return result.rows[0];
  }

  async getSongsByAlbumId(albumId) {
    const result = await this.query(
      'SELECT * FROM songs_mt WHERE album_id = $1 ORDER BY track_number',
      [albumId]
    );
    return result.rows;
  }

  async getSongsByStorefrontId(storefrontId) {
    const result = await this.query(
      'SELECT * FROM songs_mt WHERE storefront_id = $1 ORDER BY created_at DESC',
      [storefrontId]
    );
    return result.rows;
  }

  async deleteSong(id) {
    const result = await this.query('DELETE FROM songs_mt WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  // Sale methods (multi-tenant)
  async createSale(saleData) {
    const result = await this.query(`
      INSERT INTO sales_mt (storefront_id, album_id, song_id, customer_email, customer_name, amount, type, discount, stripe_payment_intent_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      saleData.storefront_id,
      saleData.album_id,
      saleData.song_id,
      saleData.customer_email,
      saleData.customer_name,
      saleData.amount,
      saleData.type,
      saleData.discount || 0,
      saleData.stripe_payment_intent_id
    ]);
    return result.rows[0].id;
  }

  async getSalesByStorefrontId(storefrontId, limit = 50) {
    const result = await this.query(`
      SELECT s.*, a.title as album_title, sg.title as song_title
      FROM sales_mt s
      LEFT JOIN albums_mt a ON s.album_id = a.id
      LEFT JOIN songs_mt sg ON s.song_id = sg.id
      WHERE s.storefront_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2
    `, [storefrontId, limit]);
    return result.rows;
  }

  // Transaction methods
  async createTransaction(transactionData) {
    const result = await this.query(`
      INSERT INTO transactions (sale_id, storefront_id, gross_amount, commission_amount, net_amount, commission_rate, stripe_transfer_id, payout_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      transactionData.sale_id,
      transactionData.storefront_id,
      transactionData.gross_amount,
      transactionData.commission_amount,
      transactionData.net_amount,
      transactionData.commission_rate,
      transactionData.stripe_transfer_id || null,
      transactionData.payout_status || 'pending'
    ]);
    return result.rows[0].id;
  }

  async getTransactionsByStorefrontId(storefrontId, status = null) {
    let query = 'SELECT * FROM transactions WHERE storefront_id = $1';
    const params = [storefrontId];

    if (status) {
      query += ' AND payout_status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.query(query, params);
    return result.rows;
  }

  async updateTransactionPayout(id, stripeTransferId, payoutDate) {
    const result = await this.query(`
      UPDATE transactions
      SET stripe_transfer_id = $1, payout_status = 'paid', payout_date = $2
      WHERE id = $3
      RETURNING *
    `, [stripeTransferId, payoutDate, id]);
    return result.rows[0];
  }

  async getPendingPayouts(storefrontId) {
    const result = await this.query(`
      SELECT SUM(net_amount) as pending_amount, COUNT(*) as transaction_count
      FROM transactions
      WHERE storefront_id = $1 AND payout_status = 'pending'
    `, [storefrontId]);
    return result.rows[0];
  }

  async getTransactionsByUser(userId) {
    const result = await this.query(`
      SELECT t.*, s.name as storefront_name, 
             sa.customer_email, sa.type as sale_type,
             a.title as album_title, sg.title as song_title
      FROM transactions t
      INNER JOIN storefronts s ON t.storefront_id = s.id
      LEFT JOIN sales_mt sa ON t.sale_id = sa.id
      LEFT JOIN albums_mt a ON sa.album_id = a.id
      LEFT JOIN songs_mt sg ON sa.song_id = sg.id
      WHERE s.owner_user_id = $1
      ORDER BY t.created_at DESC
    `, [userId]);
    return result.rows;
  }

  async getPendingPayoutsByUser(userId) {
    const result = await this.query(`
      SELECT 
        COALESCE(SUM(t.net_amount), 0) as pending_amount, 
        COUNT(*) as transaction_count
      FROM transactions t
      INNER JOIN storefronts s ON t.storefront_id = s.id
      WHERE s.owner_user_id = $1 AND t.payout_status = 'pending'
    `, [userId]);
    return result.rows[0];
  }

  async getEarningsSummary(userId) {
    const result = await this.query(`
      SELECT 
        COALESCE(SUM(t.gross_amount), 0) as total_gross,
        COALESCE(SUM(t.commission_amount), 0) as total_commission,
        COALESCE(SUM(t.net_amount), 0) as total_net,
        COALESCE(SUM(CASE WHEN t.payout_status = 'pending' THEN t.net_amount ELSE 0 END), 0) as pending_payout,
        COALESCE(SUM(CASE WHEN t.payout_status = 'paid' THEN t.net_amount ELSE 0 END), 0) as paid_out,
        COUNT(*) as total_transactions
      FROM transactions t
      INNER JOIN storefronts s ON t.storefront_id = s.id
      WHERE s.owner_user_id = $1
    `, [userId]);
    return result.rows[0];
  }

  async getRecentTransactions(userId, limit = 10) {
    const result = await this.query(`
      SELECT t.*, s.name as storefront_name,
             sa.customer_email, sa.type as sale_type,
             a.title as album_title, sg.title as song_title
      FROM transactions t
      INNER JOIN storefronts s ON t.storefront_id = s.id
      LEFT JOIN sales_mt sa ON t.sale_id = sa.id
      LEFT JOIN albums_mt a ON sa.album_id = a.id
      LEFT JOIN songs_mt sg ON sa.song_id = sg.id
      WHERE s.owner_user_id = $1
      ORDER BY t.created_at DESC
      LIMIT $2
    `, [userId, limit]);
    return result.rows;
  }

  async getAlbumWithStorefront(albumId) {
    const result = await this.query(`
      SELECT a.*, s.id as storefront_id, s.owner_user_id
      FROM albums_mt a
      LEFT JOIN storefronts s ON a.storefront_id = s.id
      WHERE a.id = $1
    `, [albumId]);
    return result.rows[0];
  }

  async getSongWithStorefront(songId) {
    const result = await this.query(`
      SELECT sg.*, 
             COALESCE(sg.storefront_id, a.storefront_id) as effective_storefront_id,
             s.owner_user_id
      FROM songs_mt sg
      LEFT JOIN albums_mt a ON sg.album_id = a.id
      LEFT JOIN storefronts s ON COALESCE(sg.storefront_id, a.storefront_id) = s.id
      WHERE sg.id = $1
    `, [songId]);
    return result.rows[0];
  }

  async getStorefrontOwnerPlan(storefrontId) {
    const result = await this.query(`
      SELECT p.*, u.id as owner_id, u.stripe_connect_account_id
      FROM storefronts s
      INNER JOIN users_mt u ON s.owner_user_id = u.id
      LEFT JOIN plans p ON u.plan_id = p.id
      WHERE s.id = $1
    `, [storefrontId]);
    return result.rows[0];
  }

  // Analytics methods
  async logTraffic(storefrontId, pagePath, ipAddress, userAgent) {
    await this.query(`
      INSERT INTO traffic_mt (storefront_id, page_path, ip_address, user_agent)
      VALUES ($1, $2, $3, $4)
    `, [storefrontId, pagePath, ipAddress, userAgent]);
  }

  async logSearch(storefrontId, query, resultCount) {
    await this.query(`
      INSERT INTO searches_mt (storefront_id, query, result_count)
      VALUES ($1, $2, $3)
    `, [storefrontId, query, resultCount]);
  }

  async getStorefrontStats(storefrontId) {
    const salesResult = await this.query(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_revenue,
        COUNT(*) as total_sales
      FROM sales_mt
      WHERE storefront_id = $1 AND status = 'completed'
    `, [storefrontId]);

    const albumsResult = await this.query(
      'SELECT COUNT(*) as album_count FROM albums_mt WHERE storefront_id = $1 AND is_active = TRUE',
      [storefrontId]
    );

    const songsResult = await this.query(
      'SELECT COUNT(*) as song_count FROM songs_mt WHERE storefront_id = $1',
      [storefrontId]
    );

    const trafficResult = await this.query(`
      SELECT COUNT(*) as page_views
      FROM traffic_mt
      WHERE storefront_id = $1 AND created_at > NOW() - INTERVAL '30 days'
    `, [storefrontId]);

    const albumCount = parseInt(albumsResult.rows[0].album_count) || 0;
    const songCount = parseInt(songsResult.rows[0].song_count) || 0;
    const totalRevenue = parseFloat(salesResult.rows[0].total_revenue) || 0;
    const totalSales = parseInt(salesResult.rows[0].total_sales) || 0;

    return {
      // Original naming (for admin/storefront page)
      albums: albumCount,
      songs: songCount,
      totalRevenue: totalRevenue,
      totalSales: totalSales,
      // Alternative naming
      total_revenue: totalRevenue,
      total_sales: totalSales,
      album_count: albumCount,
      song_count: songCount,
      page_views_30d: parseInt(trafficResult.rows[0].page_views) || 0
    };
  }

  // Subscription management methods
  async updateUserPlan(userId, planId) {
    const result = await this.query(
      'UPDATE users_mt SET plan_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [planId, userId]
    );
    return result.rows[0];
  }

  async updateUserStripeCustomerId(userId, stripeCustomerId) {
    const result = await this.query(
      'UPDATE users_mt SET stripe_customer_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [stripeCustomerId, userId]
    );
    return result.rows[0];
  }

  async updateUserStripeConnectId(userId, stripeConnectAccountId) {
    const result = await this.query(
      'UPDATE users_mt SET stripe_connect_account_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [stripeConnectAccountId, userId]
    );
    return result.rows[0];
  }

  async getUserByStripeConnectId(stripeConnectAccountId) {
    const result = await this.query(
      'SELECT * FROM users_mt WHERE stripe_connect_account_id = $1',
      [stripeConnectAccountId]
    );
    return result.rows[0];
  }

  async getUserByStripeCustomerId(stripeCustomerId) {
    const result = await this.query(
      'SELECT * FROM users_mt WHERE stripe_customer_id = $1',
      [stripeCustomerId]
    );
    return result.rows[0];
  }

  async getUserWithPlan(userId) {
    const result = await this.query(`
      SELECT u.*, p.name as plan_name, p.commission_rate, p.max_storefronts, 
             p.max_uploads, p.payout_frequency, p.features
      FROM users_mt u
      LEFT JOIN plans p ON u.plan_id = p.id
      WHERE u.id = $1
    `, [userId]);
    return result.rows[0];
  }

  async getUserUploadCount(userId) {
    const albumResult = await this.query(
      'SELECT COUNT(*) as count FROM albums_mt WHERE user_id = $1 AND is_active = TRUE',
      [userId]
    );
    const songResult = await this.query(`
      SELECT COUNT(*) as count FROM songs_mt s
      WHERE s.album_id IS NULL AND s.storefront_id IN (
        SELECT id FROM storefronts WHERE owner_user_id = $1
      )
    `, [userId]);

    return {
      albums: parseInt(albumResult.rows[0].count) || 0,
      singles: parseInt(songResult.rows[0].count) || 0,
      total: (parseInt(albumResult.rows[0].count) || 0) + (parseInt(songResult.rows[0].count) || 0)
    };
  }

  async getUserStorefrontCount(userId) {
    const result = await this.query(
      'SELECT COUNT(*) as count FROM storefronts WHERE owner_user_id = $1 AND is_active = TRUE',
      [userId]
    );
    return parseInt(result.rows[0].count) || 0;
  }

  async canUserUpload(userId) {
    const user = await this.getUserWithPlan(userId);
    if (!user) return { allowed: false, reason: 'User not found' };

    const plan = await this.getPlanById(user.plan_id);
    if (!plan) return { allowed: true, reason: 'No plan restrictions' };

    if (plan.max_uploads === null) {
      return { allowed: true, reason: 'Unlimited uploads' };
    }

    const uploadCount = await this.getUserUploadCount(userId);
    if (uploadCount.total >= plan.max_uploads) {
      return {
        allowed: false,
        reason: `Upload limit reached (${plan.max_uploads}). Upgrade your plan for more uploads.`,
        current: uploadCount.total,
        limit: plan.max_uploads
      };
    }

    return {
      allowed: true,
      remaining: plan.max_uploads - uploadCount.total,
      current: uploadCount.total,
      limit: plan.max_uploads
    };
  }

  async canUserCreateStorefront(userId) {
    const user = await this.getUserWithPlan(userId);
    if (!user) return { allowed: false, reason: 'User not found' };

    const plan = await this.getPlanById(user.plan_id);
    if (!plan) return { allowed: true, reason: 'No plan restrictions' };

    const storefrontCount = await this.getUserStorefrontCount(userId);
    if (storefrontCount >= plan.max_storefronts) {
      return {
        allowed: false,
        reason: `Storefront limit reached (${plan.max_storefronts}). Upgrade your plan for more storefronts.`,
        current: storefrontCount,
        limit: plan.max_storefronts
      };
    }

    return {
      allowed: true,
      remaining: plan.max_storefronts - storefrontCount,
      current: storefrontCount,
      limit: plan.max_storefronts
    };
  }

  // Feedback methods
  async createFeedback(feedbackData) {
    const result = await this.query(`
      INSERT INTO feedback (email, name, subject, message, rating)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [feedbackData.email, feedbackData.name, feedbackData.subject, feedbackData.message, feedbackData.rating]);
    return result.rows[0];
  }

  async getAllFeedback() {
    const result = await this.query('SELECT * FROM feedback ORDER BY created_at DESC');
    return result.rows;
  }

  async getFeedbackById(id) {
    const result = await this.query('SELECT * FROM feedback WHERE id = $1', [id]);
    return result.rows[0];
  }

  async updateFeedbackStatus(id, status) {
    const result = await this.query(
      'UPDATE feedback SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  }

  async deleteFeedback(id) {
    await this.query('DELETE FROM feedback WHERE id = $1', [id]);
  }

  async getFeedbackStats() {
    const result = await this.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'reviewed' THEN 1 END) as reviewed,
        ROUND(AVG(rating), 1) as avg_rating
      FROM feedback
    `);
    return result.rows[0];
  }

  // Public Comments methods
  async createPublicComment(name, message) {
    const result = await this.query(`
      INSERT INTO public_comments (name, message)
      VALUES ($1, $2)
      RETURNING *
    `, [name, message]);
    return result.rows[0];
  }

  async getPublicComments(limit = 50) {
    const result = await this.query(
      'SELECT * FROM public_comments ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  async deletePublicComment(id) {
    await this.query('DELETE FROM public_comments WHERE id = $1', [id]);
  }

  // ==================== ANALYTICS METHODS ====================

  async logAnalyticsEvent(eventData) {
    const result = await this.query(`
      INSERT INTO analytics_events 
      (user_id, email, session_id, event_type, page_path, target_element, target_id, duration_ms, metadata, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      eventData.user_id || null,
      eventData.email || null,
      eventData.session_id || null,
      eventData.event_type,
      eventData.page_path || null,
      eventData.target_element || null,
      eventData.target_id || null,
      eventData.duration_ms || null,
      JSON.stringify(eventData.metadata || {}),
      eventData.ip_address || null,
      eventData.user_agent || null
    ]);
    return result.rows[0];
  }

  async getOrCreateSession(sessionData) {
    let result = await this.query(
      'SELECT * FROM user_sessions WHERE session_id = $1',
      [sessionData.session_id]
    );

    if (result.rows.length === 0) {
      result = await this.query(`
        INSERT INTO user_sessions (user_id, email, session_id, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        sessionData.user_id || null,
        sessionData.email || null,
        sessionData.session_id,
        sessionData.ip_address || null,
        sessionData.user_agent || null
      ]);
    }
    return result.rows[0];
  }

  async updateSessionActivity(sessionId, durationMs) {
    const result = await this.query(`
      UPDATE user_sessions 
      SET last_activity_at = CURRENT_TIMESTAMP,
          total_duration_ms = total_duration_ms + $2,
          page_count = page_count + 1
      WHERE session_id = $1
      RETURNING *
    `, [sessionId, durationMs || 0]);
    return result.rows[0];
  }

  async getAnalyticsByEmail(email, limit = 100) {
    const result = await this.query(`
      SELECT * FROM analytics_events 
      WHERE email = $1 
      ORDER BY created_at DESC 
      LIMIT $2
    `, [email, limit]);
    return result.rows;
  }

  async getAnalyticsSummary(days = 30) {
    const result = await this.query(`
      SELECT 
        COUNT(*) FILTER (WHERE event_type = 'page_view') as total_page_views,
        COUNT(*) FILTER (WHERE event_type = 'click') as total_clicks,
        COALESCE(SUM(duration_ms) FILTER (WHERE event_type = 'time_spent'), 0) as total_time_ms,
        COUNT(DISTINCT email) FILTER (WHERE email IS NOT NULL) as unique_users,
        COUNT(DISTINCT session_id) as unique_sessions
      FROM analytics_events
      WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
    `, [days]);
    return result.rows[0];
  }

  async getTopPagesByViews(days = 30, limit = 20) {
    const result = await this.query(`
      SELECT page_path, COUNT(*) as view_count
      FROM analytics_events
      WHERE event_type = 'page_view' 
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
      GROUP BY page_path
      ORDER BY view_count DESC
      LIMIT $2
    `, [days, limit]);
    return result.rows;
  }

  async getUserEngagement(days = 30, limit = 50) {
    const result = await this.query(`
      SELECT 
        email,
        COUNT(*) FILTER (WHERE event_type = 'page_view') as page_views,
        COUNT(*) FILTER (WHERE event_type = 'click') as clicks,
        COALESCE(SUM(duration_ms) FILTER (WHERE event_type = 'time_spent'), 0) as time_spent_ms,
        MAX(created_at) as last_activity
      FROM analytics_events
      WHERE email IS NOT NULL
        AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day' * $1
      GROUP BY email
      ORDER BY page_views DESC
      LIMIT $2
    `, [days, limit]);
    return result.rows;
  }

  async getRecentAnalyticsEvents(limit = 100) {
    const result = await this.query(`
      SELECT * FROM analytics_events 
      ORDER BY created_at DESC 
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  // ==================== PROMO CODE METHODS ====================

  async createPromoCampaign(campaignData) {
    const result = await this.query(`
      INSERT INTO promo_campaigns 
      (keyword, name, description, reward_type, reward_item_id, expires_at, max_redemptions, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      campaignData.keyword.toUpperCase(),
      campaignData.name,
      campaignData.description || null,
      campaignData.reward_type,
      campaignData.reward_item_id || null,
      campaignData.expires_at || null,
      campaignData.max_redemptions || 1000,
      campaignData.created_by || null
    ]);
    return result.rows[0];
  }

  getRewardTypePrefix(rewardType) {
    const prefixMap = {
      'album': 'ALB',
      'single': 'TRK',
      'track': 'TRK',
      'subscription': 'SUB',
      'discount': 'DSC',
      'merchandise': 'MER'
    };
    return prefixMap[rewardType?.toLowerCase()] || 'PRO';
  }

  async generatePromoCodes(campaignId, count = 100) {
    const campaign = await this.getPromoCampaignById(campaignId);
    const prefix = this.getRewardTypePrefix(campaign?.reward_type);

    const codes = [];
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    for (let i = 0; i < count; i++) {
      let code;
      let attempts = 0;

      do {
        code = '';
        for (let j = 0; j < 8; j++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        attempts++;
      } while (codes.includes(code) && attempts < 100);

      if (!codes.includes(code)) {
        codes.push(code);
      }
    }

    const insertedCodes = [];
    for (const code of codes) {
      const fullCode = `${prefix}-${code}`;
      try {
        const result = await this.query(`
          INSERT INTO promo_codes (campaign_id, code, status)
          VALUES ($1, $2, 'active')
          ON CONFLICT (campaign_id, code) DO NOTHING
          RETURNING *
        `, [campaignId, fullCode]);
        if (result.rows.length > 0) {
          insertedCodes.push(result.rows[0]);
        }
      } catch (err) {
        console.error('Error inserting promo code:', err.message);
      }
    }

    return insertedCodes;
  }

  isDisposableEmail(email) {
    const disposableDomains = [
      'tempmail.org',
      '10minutemail.com',
      'mailinator.com',
      'guerrillamail.com',
      'throwaway.email',
      'temp-mail.org',
      'yopmail.com',
      'fakeinbox.com',
      'trashmail.com',
      'getairmail.com'
    ];
    const domain = email.toLowerCase().split('@')[1];
    if (!domain) return true;
    return disposableDomains.some(blocked =>
      domain === blocked || domain.endsWith('.' + blocked)
    );
  }

  async logRedemptionAttempt(email, ipAddress, keyword, code, wasSuccessful) {
    await this.query(`
      INSERT INTO redemption_attempts (email, ip_address, keyword, code, was_successful)
      VALUES ($1, $2, $3, $4, $5)
    `, [email.toLowerCase(), ipAddress, keyword, code, wasSuccessful]);
  }

  async getRecentAttemptCount(email, hoursAgo = 1) {
    const result = await this.query(`
      SELECT COUNT(*) as count 
      FROM redemption_attempts 
      WHERE email = $1 
        AND attempted_at > NOW() - INTERVAL '1 hour' * $2
    `, [email.toLowerCase(), hoursAgo]);
    return parseInt(result.rows[0].count);
  }

  async getMinutesUntilReset(email) {
    const result = await this.query(`
      SELECT MIN(attempted_at) as oldest_attempt
      FROM redemption_attempts 
      WHERE email = $1 
        AND attempted_at > NOW() - INTERVAL '1 hour'
    `, [email.toLowerCase()]);

    if (!result.rows[0]?.oldest_attempt) return 0;

    const oldestAttempt = new Date(result.rows[0].oldest_attempt);
    const resetTime = new Date(oldestAttempt.getTime() + 60 * 60 * 1000);
    const minutesUntilReset = Math.ceil((resetTime.getTime() - Date.now()) / (60 * 1000));
    return Math.max(0, minutesUntilReset);
  }

  async checkRateLimit(email, maxAttempts = 5) {
    const attemptCount = await this.getRecentAttemptCount(email, 1);
    if (attemptCount >= maxAttempts) {
      const minutesUntilReset = await this.getMinutesUntilReset(email);
      return {
        allowed: false,
        attemptsRemaining: 0,
        minutesUntilReset
      };
    }
    return {
      allowed: true,
      attemptsRemaining: maxAttempts - attemptCount,
      minutesUntilReset: 0
    };
  }

  async getPromoCampaigns(includeInactive = false) {
    let query = 'SELECT * FROM promo_campaigns';
    if (!includeInactive) {
      query += ' WHERE is_active = true';
    }
    query += ' ORDER BY created_at DESC';
    const result = await this.query(query);
    return result.rows;
  }

  async getPromoCampaignById(id) {
    const result = await this.query('SELECT * FROM promo_campaigns WHERE id = $1', [id]);
    return result.rows[0];
  }

  async getPromoCampaignByKeyword(keyword) {
    const result = await this.query(
      'SELECT * FROM promo_campaigns WHERE keyword = $1 AND is_active = true',
      [keyword.toUpperCase()]
    );
    return result.rows[0];
  }

  async getPromoCodesByCampaign(campaignId, status = null, limit = 100) {
    let query = 'SELECT * FROM promo_codes WHERE campaign_id = $1';
    const params = [campaignId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.query(query, params);
    return result.rows;
  }

  async getActivePromoCodeCount(campaignId) {
    const result = await this.query(
      'SELECT COUNT(*) as count FROM promo_codes WHERE campaign_id = $1 AND status = $2',
      [campaignId, 'active']
    );
    return parseInt(result.rows[0].count);
  }

  async getAllPromoCodes(limit = 500) {
    const result = await this.query(
      `SELECT pc.*, c.keyword, c.name as campaign_name 
       FROM promo_codes pc 
       JOIN promo_campaigns c ON pc.campaign_id = c.id 
       ORDER BY pc.created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  async validatePromoCode(keyword, code) {
    const campaign = await this.getPromoCampaignByKeyword(keyword);
    if (!campaign) {
      return { valid: false, error: 'Invalid keyword' };
    }

    if (campaign.expires_at && new Date(campaign.expires_at) < new Date()) {
      return { valid: false, error: 'Campaign has expired' };
    }

    if (campaign.current_redemptions >= campaign.max_redemptions) {
      return { valid: false, error: 'Campaign has reached maximum redemptions' };
    }

    const result = await this.query(`
      SELECT * FROM promo_codes 
      WHERE campaign_id = $1 AND code = $2 AND status = 'active'
    `, [campaign.id, code.toUpperCase()]);

    if (result.rows.length === 0) {
      return { valid: false, error: 'Invalid or already used code' };
    }

    return {
      valid: true,
      campaign: campaign,
      promoCode: result.rows[0]
    };
  }

  async redeemPromoCode(keyword, code, email, userId = null, ipAddress = null) {
    const validation = await this.validatePromoCode(keyword, code);
    if (!validation.valid) {
      return validation;
    }

    const { campaign, promoCode } = validation;

    // Check if email already redeemed this campaign
    const existingRedemption = await this.query(`
      SELECT * FROM promo_redemptions WHERE email = $1 AND campaign_id = $2
    `, [email.toLowerCase(), campaign.id]);

    if (existingRedemption.rows.length > 0) {
      return { valid: false, error: 'You have already redeemed a code from this campaign' };
    }

    // Mark code as redeemed
    await this.query(`
      UPDATE promo_codes 
      SET status = 'redeemed', redeemed_at = CURRENT_TIMESTAMP, 
          redeemed_by_user_id = $1, redeemed_by_email = $2
      WHERE id = $3
    `, [userId, email.toLowerCase(), promoCode.id]);

    // Increment campaign redemption count
    await this.query(`
      UPDATE promo_campaigns 
      SET current_redemptions = current_redemptions + 1 
      WHERE id = $1
    `, [campaign.id]);

    // Get reward item title
    let rewardItemTitle = null;
    if (campaign.reward_item_id) {
      // This would need to query the appropriate table based on reward_type
      // For now we'll leave it null
    }

    // Log redemption
    const redemptionResult = await this.query(`
      INSERT INTO promo_redemptions 
      (promo_code_id, campaign_id, user_id, email, reward_type, reward_item_id, reward_item_title, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      promoCode.id,
      campaign.id,
      userId,
      email.toLowerCase(),
      campaign.reward_type,
      campaign.reward_item_id,
      rewardItemTitle,
      ipAddress
    ]);

    const redemptionId = redemptionResult.rows[0]?.id;

    // Note: We keep the code marked as 'redeemed' rather than deleting it
    // because promo_redemptions has a foreign key reference to promo_codes

    return {
      valid: true,
      success: true,
      redemptionId: redemptionId,
      reward_type: campaign.reward_type,
      reward_item_id: campaign.reward_item_id,
      campaign_name: campaign.name,
      message: `Successfully redeemed! You can now download a free ${campaign.reward_type}.`
    };
  }

  async getPromoRedemptions(campaignId = null, limit = 100) {
    let query = 'SELECT * FROM promo_redemptions';
    const params = [];

    if (campaignId) {
      query += ' WHERE campaign_id = $1';
      params.push(campaignId);
    }

    query += ' ORDER BY redeemed_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.query(query, params);
    return result.rows;
  }

  async getPromoRedemptionById(id) {
    const result = await this.query(`
      SELECT pr.*, pc.name as campaign_name, pc.keyword
      FROM promo_redemptions pr
      JOIN promo_campaigns pc ON pr.campaign_id = pc.id
      WHERE pr.id = $1
    `, [id]);
    return result.rows[0];
  }

  async getSingleById(id) {
    const result = await this.query(`
      SELECT * FROM songs_mt WHERE id = $1 AND album_id IS NULL
    `, [id]);
    return result.rows[0];
  }

  async getPromoStats() {
    const result = await this.query(`
      SELECT 
        (SELECT COUNT(*) FROM promo_campaigns WHERE is_active = true) as active_campaigns,
        (SELECT COUNT(*) FROM promo_codes WHERE status = 'active') as available_codes,
        (SELECT COUNT(*) FROM promo_codes WHERE status = 'redeemed') as redeemed_codes,
        (SELECT COUNT(*) FROM promo_redemptions) as total_redemptions
    `);
    return result.rows[0];
  }

  async deactivatePromoCampaign(id) {
    const result = await this.query(
      'UPDATE promo_campaigns SET is_active = false WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  async deletePromoCampaign(id) {
    await this.query('DELETE FROM promo_campaigns WHERE id = $1', [id]);
  }

  async hasUserRedeemedCampaign(email, campaignId) {
    const result = await this.query(
      'SELECT id FROM promo_redemptions WHERE email = $1 AND campaign_id = $2',
      [email.toLowerCase(), campaignId]
    );
    return result.rows.length > 0;
  }

  async getUserRedemptions(email) {
    const result = await this.query(`
      SELECT pr.*, pc.name as campaign_name, pc.keyword
      FROM promo_redemptions pr
      JOIN promo_campaigns pc ON pr.campaign_id = pc.id
      WHERE pr.email = $1
      ORDER BY pr.redeemed_at DESC
    `, [email.toLowerCase()]);
    return result.rows;
  }

  // Password Reset Functions
  async createPasswordResetToken(userId, token, expiresAt) {
    // Invalidate any existing tokens for this user
    await this.query(
      'UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false',
      [userId]
    );

    const result = await this.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, token, expiresAt]
    );
    return result.rows[0];
  }

  async getValidPasswordResetToken(token) {
    const result = await this.query(
      `SELECT prt.*, u.email, u.username 
       FROM password_reset_tokens prt
       JOIN users_mt u ON prt.user_id = u.id
       WHERE prt.token = $1 AND prt.used = false AND prt.expires_at > NOW()`,
      [token]
    );
    return result.rows[0];
  }

  async markPasswordResetTokenUsed(token) {
    await this.query(
      'UPDATE password_reset_tokens SET used = true WHERE token = $1',
      [token]
    );
  }

  async updateUserPassword(userId, newPasswordHash) {
    await this.query(
      'UPDATE users_mt SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );
  }

  // ==========================================
  // Stripe Checkout / Orders Methods
  // ==========================================

  async createOrder(order) {
    await this.query(
      `INSERT INTO orders (id, user_id, order_type, item_id, amount_total, currency, status, stripe_checkout_session_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [order.id, order.userId, order.orderType, order.itemId, order.amountTotal, order.currency, order.status, order.stripeCheckoutSessionId, Date.now(), Date.now()]
    );
    return order;
  }

  async getOrderById(id) {
    const result = await this.query('SELECT * FROM orders WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? {
      id: row.id,
      userId: row.user_id,
      orderType: row.order_type,
      itemId: row.item_id,
      amountTotal: row.amount_total,
      currency: row.currency,
      status: row.status,
      stripeCheckoutSessionId: row.stripe_checkout_session_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      createdAt: parseInt(row.created_at)
    } : null;
  }

  async getOrderBySessionId(sessionId) {
    const result = await this.query('SELECT * FROM orders WHERE stripe_checkout_session_id = $1', [sessionId]);
    const row = result.rows[0];
    return row ? {
      id: row.id,
      userId: row.user_id,
      orderType: row.order_type,
      itemId: row.item_id,
      amountTotal: row.amount_total,
      currency: row.currency,
      status: row.status,
      stripeCheckoutSessionId: row.stripe_checkout_session_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      createdAt: parseInt(row.created_at)
    } : null;
  }

  async updateOrderStatus(id, status, stripePaymentIntentId = null) {
    let query = 'UPDATE orders SET status = $1, updated_at = $2';
    let params = [status, Date.now()];
    let paramIndex = 3;

    if (stripePaymentIntentId) {
      query += `, stripe_payment_intent_id = $${paramIndex}`;
      params.push(stripePaymentIntentId);
      paramIndex++;
    }

    query += ` WHERE id = $${paramIndex}`;
    params.push(id);

    await this.query(query, params);
  }

  async createEntitlement(entitlement) {
    await this.query(
      `INSERT INTO entitlements (id, user_id, entitlement_type, item_id, order_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, entitlement_type, item_id) DO UPDATE SET is_active = 1`,
      [entitlement.id, entitlement.userId, entitlement.entitlementType, entitlement.itemId, entitlement.orderId, Date.now()]
    );
    return entitlement;
  }

  async getEntitlementsByUserId(userId) {
    const result = await this.query('SELECT * FROM entitlements WHERE user_id = $1 AND is_active = 1', [userId]);
    return result.rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      entitlementType: r.entitlement_type,
      itemId: r.item_id,
      orderId: r.order_id,
      isActive: r.is_active === 1,
      createdAt: parseInt(r.created_at)
    }));
  }

  async createDownloadToken(tokenData) {
    await this.query(
      `INSERT INTO download_tokens (id, token, user_id, entitlement_type, item_id, order_id, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tokenData.id, tokenData.token, tokenData.userId, tokenData.entitlementType, tokenData.itemId, tokenData.orderId, tokenData.expiresAt, Date.now()]
    );
    return tokenData;
  }

  async getDownloadToken(token) {
    const result = await this.query('SELECT * FROM download_tokens WHERE token = $1', [token]);
    const row = result.rows[0];
    return row ? {
      id: row.id,
      token: row.token,
      userId: row.user_id,
      entitlementType: row.entitlement_type,
      itemId: row.item_id,
      orderId: row.order_id,
      expiresAt: parseInt(row.expires_at),
      createdAt: parseInt(row.created_at)
    } : null;
  }

  // Cleanup
  async close() {
    await this.pool.end();
  }
}

const pgDatabase = new PgDatabase();
export default pgDatabase;
