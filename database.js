import sqlite3Pkg from 'sqlite3';
import bcrypt from 'bcrypt';

const sqlite3 = sqlite3Pkg.verbose();

class Database {
  constructor() {
    this.db = new sqlite3.Database('./music.db', (err) => {
      if (err) console.error('Database connection error:', err);
    });
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Users table
        this.db.run(`CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          email TEXT UNIQUE,
          bank_info TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Albums table
        this.db.run(`CREATE TABLE IF NOT EXISTS albums (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          price DECIMAL(10,2) DEFAULT 8.00,
          album_art TEXT DEFAULT 'default.jpg',
          release_date DATE,
          is_active BOOLEAN DEFAULT 1,
          display_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          user_id INTEGER,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`);

        // Add display_order column if it doesn't exist (for existing databases)
        this.db.run(`ALTER TABLE albums ADD COLUMN display_order INTEGER DEFAULT 0`, () => { });

        // Songs table (album_id is nullable for singles)
        this.db.run(`CREATE TABLE IF NOT EXISTS songs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          album_id INTEGER,
          title TEXT NOT NULL,
          file_path TEXT NOT NULL,
          price DECIMAL(10,2) DEFAULT 0.99,
          duration INTEGER,
          track_number INTEGER,
          play_count INTEGER DEFAULT 0,
          cover_art TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
        )`);

        // Add cover_art column if it doesn't exist (for existing databases)
        this.db.run(`ALTER TABLE songs ADD COLUMN cover_art TEXT`, () => { });

        // Add display_order column for singles ordering
        this.db.run(`ALTER TABLE songs ADD COLUMN display_order INTEGER DEFAULT 0`, () => { });

        // Migration: Ensure album_id allows NULL for singles support
        // SQLite doesn't support ALTER COLUMN, so we need to recreate the table if needed
        this.db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='songs'", (err, row) => {
          if (err) return;
          if (row && row.sql && row.sql.includes('album_id INTEGER NOT NULL')) {
            console.log('Migrating songs table to allow NULL album_id...');
            this.db.serialize(() => {
              this.db.run(`CREATE TABLE IF NOT EXISTS songs_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                album_id INTEGER,
                title TEXT NOT NULL,
                file_path TEXT NOT NULL,
                price DECIMAL(10,2) DEFAULT 0.99,
                duration INTEGER,
                track_number INTEGER,
                play_count INTEGER DEFAULT 0,
                cover_art TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
              )`);
              this.db.run(`INSERT INTO songs_new SELECT id, album_id, title, file_path, price, duration, track_number, play_count, cover_art, created_at FROM songs`);
              this.db.run(`DROP TABLE songs`);
              this.db.run(`ALTER TABLE songs_new RENAME TO songs`, () => {
                console.log('Songs table migration completed');
              });
            });
          }
        });

        // Sales table
        this.db.run(`CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          album_id INTEGER,
          song_id INTEGER,
          customer_email TEXT NOT NULL,
          customer_name TEXT,
          amount DECIMAL(10,2) NOT NULL,
          type TEXT CHECK(type IN ('album', 'song')),
          discount DECIMAL(5,2) DEFAULT 0,
          status TEXT DEFAULT 'completed',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (album_id) REFERENCES albums(id),
          FOREIGN KEY (song_id) REFERENCES songs(id)
        )`);

        // Traffic analytics
        this.db.run(`CREATE TABLE IF NOT EXISTS traffic (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          page_path TEXT,
          ip_address TEXT,
          user_agent TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Search analytics
        this.db.run(`CREATE TABLE IF NOT EXISTS searches (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query TEXT NOT NULL,
          result_count INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create default admin user only if no users exist
        this.db.get('SELECT COUNT(*) as count FROM users', (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          if (row.count === 0) {
            const hashedPassword = bcrypt.hashSync('admin123', 10);
            this.db.run(
              'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
              ['admin', hashedPassword, 'admin@example.com']
            );
            console.log('Default admin user created');
          }

          // Run migrations after initialization
          this.migrateUsersTable().then(() => resolve()).catch(err => reject(err));
        });
      });
    });
  }

  async migrateUsersTable() {
    return new Promise((resolve, reject) => {
      this.db.all("PRAGMA table_info(users)", async (err, rows) => {
        if (err) return reject(err);

        const hasRole = rows.some(r => r.name === 'role');
        const hasPlanId = rows.some(r => r.name === 'plan_id');

        if (!hasRole) {
          console.log('Migrating users table: Adding role column');
          await new Promise(r => this.db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'visitor'", r));
        }
        if (!hasPlanId) {
          console.log('Migrating users table: Adding plan_id column');
          await new Promise(r => this.db.run("ALTER TABLE users ADD COLUMN plan_id INTEGER DEFAULT 1", r));
        }
        resolve();
      });
    });
  }

  // User methods
  async createUser(userData) {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO users (username, password, email, bank_info, role, plan_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userData.username, hashedPassword, userData.email, userData.bank_info, userData.role || 'visitor', userData.plan_id || 1],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Mock plan methods for SQLite compatibility
  async getPlanByName(name) {
    // Return a dummy plan object
    const plans = {
      'visitor': { id: 1, name: 'visitor', price: 0 },
      'artist': { id: 2, name: 'artist', price: 9.99 },
      'label': { id: 3, name: 'label', price: 29.99 }
    };
    return plans[name] || plans['visitor'];
  }

  async getUserByUsername(username) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getUserById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT id, username, email, bank_info, created_at FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async updateUserBankInfo(userId, bankInfo) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET bank_info = ? WHERE id = ?',
        [bankInfo, userId],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async updateUserCredentials(userId, username, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE users SET username = ?, password = ? WHERE id = ?',
        [username, hashedPassword, userId],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async verifyUserPassword(userId, password) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT password FROM users WHERE id = ?', [userId], async (err, row) => {
        if (err) reject(err);
        else if (!row) resolve(false);
        else {
          const match = await bcrypt.compare(password, row.password);
          resolve(match);
        }
      });
    });
  }

  // Album methods
  async getAlbumCount() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM albums WHERE is_active = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row?.count || 0);
      });
    });
  }

  async createAlbum(albumData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO albums (title, description, price, album_art, release_date, user_id) VALUES (?, ?, ?, ?, ?, ?)',
        [albumData.title, albumData.description, albumData.price, albumData.album_art, albumData.release_date, albumData.user_id || 1],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getAlbumById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM albums WHERE id = ? AND is_active = 1', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getAllAlbums() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT albums.*, COUNT(songs.id) as song_count 
        FROM albums 
        LEFT JOIN songs ON albums.id = songs.album_id 
        WHERE albums.is_active = 1 
        GROUP BY albums.id 
        ORDER BY albums.display_order ASC, albums.created_at DESC
      `, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async updateAlbumOrder(albumOrders) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare('UPDATE albums SET display_order = ? WHERE id = ?');
      let completed = 0;
      let hasError = false;

      albumOrders.forEach(({ id, order }) => {
        stmt.run(order, id, (err) => {
          if (err && !hasError) {
            hasError = true;
            reject(err);
          }
          completed++;
          if (completed === albumOrders.length && !hasError) {
            stmt.finalize();
            resolve(true);
          }
        });
      });

      if (albumOrders.length === 0) {
        stmt.finalize();
        resolve(true);
      }
    });
  }

  async updateAlbum(id, albumData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const values = [];

      Object.keys(albumData).forEach(key => {
        if (albumData[key] !== undefined) {
          fields.push(`${key} = ?`);
          values.push(albumData[key]);
        }
      });

      values.push(id);

      this.db.run(
        `UPDATE albums SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }

  async deleteAlbum(id) {
    return new Promise((resolve, reject) => {
      this.db.run('UPDATE albums SET is_active = 0 WHERE id = ?', [id], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async getAllActiveAlbums() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT id, title, description, price, album_art FROM albums WHERE is_active = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Song methods
  async createSong(songData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO songs (album_id, title, file_path, price, track_number) VALUES (?, ?, ?, ?, ?)',
        [songData.album_id, songData.title, songData.file_path, songData.price, songData.track_number],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getSongById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM songs WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getSongsByAlbumId(albumId) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM songs WHERE album_id = ? ORDER BY track_number', [albumId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async deleteSong(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM songs WHERE id = ?', [id], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async getAllSongs() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT s.*, a.title as album_title FROM songs s LEFT JOIN albums a ON s.album_id = a.id WHERE s.album_id IS NOT NULL AND (a.is_active = 1 OR a.is_active IS NULL)', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Singles methods (songs without album_id)
  async createSingle(songData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO songs (album_id, title, file_path, price, cover_art) VALUES (NULL, ?, ?, ?, ?)',
        [songData.title, songData.file_path, songData.price, songData.cover_art],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getAllSingles() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM songs WHERE album_id IS NULL ORDER BY display_order ASC, created_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async updateSingleOrder(singleOrders) {
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare('UPDATE songs SET display_order = ? WHERE id = ?');
      let completed = 0;
      let hasError = false;

      singleOrders.forEach(({ id, order }) => {
        stmt.run(order, id, (err) => {
          if (err && !hasError) {
            hasError = true;
            reject(err);
          }
          completed++;
          if (completed === singleOrders.length && !hasError) {
            stmt.finalize();
            resolve(true);
          }
        });
      });

      if (singleOrders.length === 0) {
        stmt.finalize();
        resolve(true);
      }
    });
  }

  async updateSong(id, songData) {
    return new Promise((resolve, reject) => {
      const fields = [];
      const params = [];

      if (songData.duration !== undefined) {
        fields.push('duration = ?');
        params.push(songData.duration);
      }
      if (songData.tempo !== undefined) {
        fields.push('tempo = ?');
        params.push(songData.tempo);
      }
      if (songData.title !== undefined) {
        fields.push('title = ?');
        params.push(songData.title);
      }
      if (songData.price !== undefined) {
        fields.push('price = ?');
        params.push(songData.price);
      }

      if (fields.length === 0) {
        resolve(0);
        return;
      }

      params.push(id);
      const query = `UPDATE songs SET ${fields.join(', ')} WHERE id = ?`;

      this.db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async updateSingle(id, songData) {
    return new Promise((resolve, reject) => {
      let query = 'UPDATE songs SET title = ?, price = ?';
      let params = [songData.title, songData.price];

      if (songData.file_path) {
        query += ', file_path = ?';
        params.push(songData.file_path);
      }
      if (songData.cover_art) {
        query += ', cover_art = ?';
        params.push(songData.cover_art);
      }

      query += ' WHERE id = ? AND album_id IS NULL';
      params.push(id);

      this.db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async deleteSingle(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM songs WHERE id = ? AND album_id IS NULL', [id], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  // Sales methods
  async createSale(saleData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO sales (album_id, song_id, customer_email, customer_name, amount, type, discount) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [saleData.album_id, saleData.song_id, saleData.customer_email, saleData.customer_name, saleData.amount, saleData.type, saleData.discount || 0],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getSaleById(id) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM sales WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getRecentSales(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT s.*, a.title as album_title, sg.title as song_title
         FROM sales s 
         LEFT JOIN albums a ON s.album_id = a.id 
         LEFT JOIN songs sg ON s.song_id = sg.id 
         ORDER BY s.created_at DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getUserPurchaseCount(email) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM sales WHERE customer_email = ? AND status = "completed"',
        [email],
        (err, row) => {
          if (err) reject(err);
          else resolve(row?.count || 0);
        }
      );
    });
  }

  // Analytics methods
  async getDashboardStats() {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT 
          (SELECT COUNT(*) FROM albums WHERE is_active = 1) as total_albums,
          (SELECT COUNT(*) FROM songs) as total_songs,
          (SELECT COUNT(*) FROM sales) as total_sales,
          (SELECT COALESCE(SUM(amount), 0) FROM sales) as total_revenue,
          (SELECT COUNT(DISTINCT customer_email) FROM sales) as total_customers`,
        (err, row) => {
          if (err) reject(err);
          else resolve(row || { total_albums: 0, total_songs: 0, total_sales: 0, total_revenue: 0, total_customers: 0 });
        }
      );
    });
  }

  async getTrafficStats(days = 30) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT 
          DATE(created_at) as date,
          COUNT(*) as visits,
          COUNT(DISTINCT ip_address) as unique_visitors
         FROM traffic 
         WHERE created_at >= datetime('now', '-${days} days')
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Search analytics
  async logSearch(query, resultCount) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO searches (query, result_count) VALUES (?, ?)',
        [query, resultCount],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getRecentSearches(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM searches ORDER BY created_at DESC LIMIT ?',
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  async getTopSearches(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT query, COUNT(*) as search_count, 
                AVG(result_count) as avg_results 
         FROM searches 
         GROUP BY query 
         ORDER BY search_count DESC 
         LIMIT ?`,
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  }

  // Log traffic
  async logTraffic(pagePath, ip, userAgent) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO traffic (page_path, ip_address, user_agent) VALUES (?, ?, ?)',
        [pagePath, ip, userAgent],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  // Missing Analytics methods for SQLite compatibility
  async getOrCreateSession(data) {
    return { session_id: data.session_id }; // Mock
  }

  async updateSessionActivity(sessionId, duration) {
    return true; // Mock
  }

  async logAnalyticsEvent(eventData) {
    return true; // Mock
  }

  async getAnalyticsSummary(days) {
    return {
      total_sessions: 0,
      unique_visitors: 0,
      avg_duration: 0,
      top_pages: []
    };
  }

  // Missing Comment methods for SQLite compatibility
  async createPublicComment(name, message) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'CREATE TABLE IF NOT EXISTS public_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
        (err) => {
          if (err) return reject(err);
          this.db.run(
            'INSERT INTO public_comments (name, message) VALUES (?, ?)',
            [name, message],
            function (err) {
              if (err) reject(err);
              else resolve({ id: this.lastID, name, message, created_at: new Date() });
            }
          );
        }
      );
    });
  }

  async deletePublicComment(id) {
    return new Promise((resolve, reject) => {
      this.db.run('DELETE FROM public_comments WHERE id = ?', [id], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async getPublicComments(limit = 10) {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM public_comments ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
        // If table doesn't exist, generic error or empty array
        if (err && err.message.includes('no such table')) resolve([]);
        else if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async createFeedback(data) {
    // data: { email, name, subject, message, rating }
    return new Promise((resolve, reject) => {
      this.db.run(
        'CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, name TEXT, subject TEXT, message TEXT, rating INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)',
        (err) => {
          if (err) return reject(err);
          this.db.run(
            'INSERT INTO feedback (email, name, subject, message, rating) VALUES (?, ?, ?, ?, ?)',
            [data.email, data.name, data.subject, data.message, data.rating],
            function (err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        }
      );
    });
  }

  async getAlbumWithStorefront(albumId) {
    // Mock for SQLite
    return { id: albumId, title: 'Mock Album', storefront_id: 'mock_sf', price: 1000 };
  }

  async getSongWithStorefront(songId) {
    // Mock for SQLite
    return { id: songId, title: 'Mock Song', effective_storefront_id: 'mock_sf', price: 100 };
  }

  async getStorefrontOwnerPlan(storefrontId) {
    // Mock for SQLite
    return { name: 'creator', commission_rate: 0.12 };
  }

  // ==========================================
  // Stripe Checkout / Orders Methods
  // ==========================================

  async _ensureOrderTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            order_type TEXT NOT NULL,
            item_id TEXT,
            amount_total INTEGER NOT NULL,
            currency TEXT DEFAULT 'usd',
            status TEXT NOT NULL,
            stripe_checkout_session_id TEXT UNIQUE,
            stripe_payment_intent_id TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER
          )
        `);
        this.db.run(`
          CREATE TABLE IF NOT EXISTS entitlements (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            entitlement_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            order_id TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL
          )
        `);
        this.db.run(`
          CREATE TABLE IF NOT EXISTS download_tokens (
            id TEXT PRIMARY KEY,
            token TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            entitlement_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            order_id TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async createOrder(order) {
    await this._ensureOrderTables();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO orders (id, user_id, order_type, item_id, amount_total, currency, status, stripe_checkout_session_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [order.id, order.userId, order.orderType, order.itemId, order.amountTotal, order.currency, order.status, order.stripeCheckoutSessionId, Date.now(), Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve(order);
        }
      );
    });
  }

  async getOrderById(id) {
    await this._ensureOrderTables();
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM orders WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row ? {
          id: row.id,
          userId: row.user_id,
          orderType: row.order_type,
          itemId: row.item_id,
          amountTotal: row.amount_total,
          currency: row.currency,
          status: row.status,
          stripeCheckoutSessionId: row.stripe_checkout_session_id,
          stripePaymentIntentId: row.stripe_payment_intent_id,
          createdAt: row.created_at
        } : null);
      });
    });
  }

  async getOrderBySessionId(sessionId) {
    await this._ensureOrderTables();
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM orders WHERE stripe_checkout_session_id = ?', [sessionId], (err, row) => {
        if (err) reject(err);
        else resolve(row ? {
          id: row.id,
          userId: row.user_id,
          orderType: row.order_type,
          itemId: row.item_id,
          amountTotal: row.amount_total,
          currency: row.currency,
          status: row.status,
          stripeCheckoutSessionId: row.stripe_checkout_session_id,
          stripePaymentIntentId: row.stripe_payment_intent_id,
          createdAt: row.created_at
        } : null);
      });
    });
  }

  async updateOrderStatus(id, status, stripePaymentIntentId = null) {
    await this._ensureOrderTables();
    return new Promise((resolve, reject) => {
      let query = 'UPDATE orders SET status = ?, updated_at = ?';
      let params = [status, Date.now()];

      if (stripePaymentIntentId) {
        query += ', stripe_payment_intent_id = ?';
        params.push(stripePaymentIntentId);
      }

      query += ' WHERE id = ?';
      params.push(id);

      this.db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });
  }

  async createEntitlement(entitlement) {
    await this._ensureOrderTables();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO entitlements (id, user_id, entitlement_type, item_id, order_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [entitlement.id, entitlement.userId, entitlement.entitlementType, entitlement.itemId, entitlement.orderId, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve(entitlement);
        }
      );
    });
  }

  async getEntitlementsByUserId(userId) {
    await this._ensureOrderTables();
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM entitlements WHERE user_id = ? AND is_active = 1', [userId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows.map(r => ({
          id: r.id,
          userId: r.user_id,
          entitlementType: r.entitlement_type,
          itemId: r.item_id,
          orderId: r.order_id,
          isActive: r.is_active === 1,
          createdAt: r.created_at
        })));
      });
    });
  }

  async createDownloadToken(tokenData) {
    await this._ensureOrderTables();
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO download_tokens (id, token, user_id, entitlement_type, item_id, order_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [tokenData.id, tokenData.token, tokenData.userId, tokenData.entitlementType, tokenData.itemId, tokenData.orderId, tokenData.expiresAt, Date.now()],
        (err) => {
          if (err) reject(err);
          else resolve(tokenData);
        }
      );
    });
  }

  async getDownloadToken(token) {
    await this._ensureOrderTables();
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM download_tokens WHERE token = ?', [token], (err, row) => {
        if (err) reject(err);
        else resolve(row ? {
          id: row.id,
          token: row.token,
          userId: row.user_id,
          entitlementType: row.entitlement_type,
          itemId: row.item_id,
          orderId: row.order_id,
          expiresAt: row.expires_at,
          createdAt: row.created_at
        } : null);
      });
    });
  }
}

export default new Database();
