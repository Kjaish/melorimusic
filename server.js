import express from 'express';
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';
import database from './database.js';
import searchEngine from './search-engine.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for dev/HTTP-only matching
}));
app.use(compression());
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'albumArt') {
      cb(null, 'public/uploads/album_art/');
    } else if (file.fieldname === 'musicFiles') {
      cb(null, 'public/uploads/music_files/');
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'albumArt') {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error('Only image files are allowed for album art'));
    } else if (file.fieldname === 'musicFiles') {
      const allowedTypes = /mp3|wav|m4a|flac|ogg/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      if (extname) {
        return cb(null, true);
      }
      cb(new Error('Only audio files are allowed'));
    } else {
      cb(null, true);
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Routes
app.get('/', async (req, res) => {
  try {
    const albums = await database.getAllAlbums();
    res.render('index', {
      albums,
      user: req.session.userId ? await database.getUserById(req.session.userId) : null,
      searchQuery: ''
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading albums');
  }
});

app.get('/album/:id', async (req, res) => {
  try {
    const album = await database.getAlbumById(req.params.id);
    const songs = await database.getSongsByAlbumId(req.params.id);
    if (!album) {
      return res.status(404).render('404');
    }
    res.render('album', { album, songs });
  } catch (error) {
    res.status(404).render('404');
  }
});

// Search Routes
app.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    let results = [];

    if (query.trim()) {
      results = await searchEngine.search(query);
      await database.logSearch(query, results.length);
    }

    res.render('search', {
      results,
      query,
      albums: results.filter(r => r.type === 'album'),
      songs: results.filter(r => r.type === 'song')
    });
  } catch (error) {
    console.error('Search error:', error);
    res.render('search', { results: [], query: req.query.q || '', albums: [], songs: [] });
  }
});

app.get('/api/search/suggest', async (req, res) => {
  try {
    const query = req.query.q || '';
    if (query.length < 2) {
      return res.json([]);
    }

    const suggestions = await searchEngine.getSuggestions(query);
    res.json(suggestions);
  } catch (error) {
    res.json([]);
  }
});

// Speed Networking
app.get('/networking', async (req, res) => {
  try {
    res.render('networking', {
      user: req.session.userId ? await database.getUserById(req.session.userId) : null,
      searchQuery: ''
    });
  } catch (error) {
    console.error('Networking page error:', error);
    res.status(500).render('error', { message: 'Error loading networking page' });
  }
});

// Public Pages
app.get('/music', async (req, res) => {
  try {
    const albums = await database.getAllAlbums();
    const allSongs = await database.getAllSongs();
    const singles = await database.getAllSingles();

    let user = null;
    let isAdmin = false;
    if (req.session.userId) {
      user = await database.getUserById(req.session.userId);
      isAdmin = user && (user.username === 'admin' || user.role === 'admin');
    }

    res.render('music', {
      albums,
      singles,
      songs: allSongs,
      user,
      isAdmin,
      title: 'Music Library'
    });
  } catch (error) {
    console.error('Error loading music page:', error);
    res.status(500).render('error', { message: 'Error loading music library' });
  }
});

app.get('/about', async (req, res) => {
  res.render('about', {
    user: req.session.userId ? await database.getUserById(req.session.userId) : null
  });
});

app.get('/support', async (req, res) => {
  res.render('support', {
    user: req.session.userId ? await database.getUserById(req.session.userId) : null,
    raised: 12500,
    goal: 50000,
    stripePublicKey: process.env.STRIPE_PUBLIC_KEY || ''
  });
});

app.get('/terms', (req, res) => {
  res.render('terms');
});

app.get('/privacy', (req, res) => {
  res.render('privacy');
});

// Feedback
app.get('/feedback', async (req, res) => {
  res.render('feedback', {
    user: req.session.userId ? await database.getUserById(req.session.userId) : null,
    success: req.query.success === 'true'
  });
});

app.post('/feedback', async (req, res) => {
  try {
    const { name, email, subject, message, rating } = req.body;
    await database.createFeedback({ name, email, subject, message, rating });
    res.redirect('/feedback?success=true');
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).render('error', { message: 'Error submitting feedback' });
  }
});

// Registration
app.get('/register', (req, res) => {
  res.render('register', {
    error: null,
    username: '',
    email: ''
  });
});

app.post('/register', async (req, res) => {
  try {
    const { username, email, password, terms } = req.body;

    if (!terms) {
      return res.render('register', {
        error: 'You must agree to the terms and privacy policy',
        username,
        email
      });
    }

    try {
      await database.createUser({
        username,
        email,
        password,
        role: 'visitor',
        plan_id: 1
      });
      res.redirect('/login?registered=true');
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return res.render('register', {
          error: 'Username or email already exists',
          username,
          email
        });
      }
      throw err;
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.render('register', {
      error: 'Error creating account. Please try again.',
      username,
      email
    });
  }
});

// Admin Routes
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await database.getUserByUsername(username);
    if (user && await bcrypt.compare(password, user.password)) {
      req.session.userId = user.id;
      res.redirect('/admin/dashboard');
    } else {
      res.render('login', { error: 'Invalid credentials' });
    }
  } catch (error) {
    res.render('login', { error: 'Login error' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/admin/dashboard', requireAuth, async (req, res) => {
  try {
    const stats = await database.getDashboardStats();
    const albums = await database.getAllAlbums();
    const sales = await database.getRecentSales(10);
    const searches = await database.getRecentSearches(10);

    const albumCount = await database.getAlbumCount();
    const canUploadMore = albumCount < 50;

    res.render('admin/dashboard', {
      stats,
      albums,
      sales,
      searches,
      albumCount,
      canUploadMore,
      maxAlbums: 50
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { message: 'Dashboard error' });
  }
});

// Album Management
app.get('/admin/albums', requireAuth, async (req, res) => {
  const albums = await database.getAllAlbums();
  res.render('admin/albums', { albums });
});

app.get('/admin/albums/new', requireAuth, async (req, res) => {
  const albumCount = await database.getAlbumCount();
  if (albumCount >= 50) {
    return res.render('error', {
      message: 'Maximum album limit (50) reached. Delete some albums to add new ones.'
    });
  }
  res.render('admin/album-form', { album: null, edit: false });
});

app.get('/admin/albums/edit/:id', requireAuth, async (req, res) => {
  try {
    const album = await database.getAlbumById(req.params.id);
    const songs = await database.getSongsByAlbumId(req.params.id);
    res.render('admin/album-form', { album, songs, edit: true });
  } catch (error) {
    res.redirect('/admin/albums');
  }
});

app.post('/admin/albums', requireAuth, upload.fields([
  { name: 'albumArt', maxCount: 1 },
  { name: 'musicFiles', maxCount: 20 }
]), async (req, res) => {
  try {
    const albumCount = await database.getAlbumCount();
    if (albumCount >= 50) {
      return res.status(400).render('error', {
        message: 'Maximum album limit (50) reached.'
      });
    }

    const { title, description, price, releaseDate } = req.body;
    const albumArt = req.files['albumArt'] ? req.files['albumArt'][0].filename : 'default.jpg';

    const albumId = await database.createAlbum({
      title,
      description,
      price: price || 8.00,
      album_art: albumArt,
      release_date: releaseDate,
      user_id: req.session.userId
    });

    if (req.files['musicFiles']) {
      let trackNumber = 1;
      for (const file of req.files['musicFiles']) {
        const songTitle = req.body['songTitles']?.[trackNumber - 1] ||
          file.originalname.replace(path.extname(file.originalname), '');

        await database.createSong({
          album_id: albumId,
          title: songTitle,
          file_path: file.filename,
          price: 0.99,
          track_number: trackNumber
        });
        trackNumber++;
      }
    }

    await searchEngine.indexAlbum(albumId);

    res.redirect('/admin/albums');
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { message: 'Error creating album' });
  }
});

app.post('/admin/albums/update/:id', requireAuth, upload.fields([
  { name: 'albumArt', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description, price, releaseDate } = req.body;
    const albumData = {
      title,
      description,
      price: price || 8.00,
      release_date: releaseDate
    };

    if (req.files['albumArt']) {
      albumData.album_art = req.files['albumArt'][0].filename;
    }

    await database.updateAlbum(req.params.id, albumData);
    await searchEngine.indexAlbum(req.params.id);

    res.redirect('/admin/albums');
  } catch (error) {
    res.status(500).render('error', { message: 'Error updating album' });
  }
});

app.post('/admin/albums/delete/:id', requireAuth, async (req, res) => {
  try {
    await database.deleteAlbum(req.params.id);
    res.redirect('/admin/albums');
  } catch (error) {
    res.status(500).render('error', { message: 'Error deleting album' });
  }
});

// Song Management
app.post('/admin/songs', requireAuth, upload.single('musicFile'), async (req, res) => {
  try {
    const { album_id, title, price, track_number } = req.body;

    await database.createSong({
      album_id,
      title,
      file_path: req.file.filename,
      price: price || 0.80,
      track_number
    });

    await searchEngine.indexAlbum(album_id);

    res.redirect(`/admin/albums/edit/${album_id}`);
  } catch (error) {
    res.status(500).render('error', { message: 'Error adding song' });
  }
});

// Payment processing
app.post('/purchase/album/:id', async (req, res) => {
  try {
    const album = await database.getAlbumById(req.params.id);
    const { email, name } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    const userPurchases = await database.getUserPurchaseCount(email);
    const discount = userPurchases >= 4 ? 0.10 : 0;

    const finalPrice = album.price * (1 - discount);

    const saleId = await database.createSale({
      album_id: album.id,
      customer_email: email,
      customer_name: name,
      amount: finalPrice,
      type: 'album',
      discount: discount * 100
    });

    await sendThankYouEmail(email, name, album, saleId, finalPrice, discount);

    res.json({
      success: true,
      message: 'Purchase successful! Check your email for download links.',
      saleId,
      discount: discount > 0 ? `${(discount * 100)}% discount applied` : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Purchase failed' });
  }
});

app.post('/purchase/song/:id', async (req, res) => {
  try {
    const song = await database.getSongById(req.params.id);
    const { email, name } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    const saleId = await database.createSale({
      song_id: song.id,
      customer_email: email,
      customer_name: name,
      amount: song.price,
      type: 'song'
    });

    await sendThankYouEmail(email, name, null, saleId, song.price, 0, song);

    res.json({
      success: true,
      message: 'Purchase successful! Check your email for download link.',
      saleId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Purchase failed' });
  }
});

// Analytics API
app.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    const stats = await database.getDashboardStats();
    const traffic = await database.getTrafficStats(30);
    const topSearches = await database.getTopSearches(10);

    res.json({ stats, traffic, topSearches });
  } catch (error) {
    res.status(500).json({ error: 'Analytics error' });
  }
});

app.post('/api/analytics/event', async (req, res) => {
  try {
    await database.logAnalyticsEvent(req.body);
    res.json({ success: true });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(200).json({ success: false }); // Don't crash client
  }
});

// Bank Info Management
app.get('/admin/bank', requireAuth, async (req, res) => {
  try {
    const user = await database.getUserById(req.session.userId);
    res.render('admin/bank', { user });
  } catch (error) {
    res.status(500).render('error', { message: 'Error loading bank info' });
  }
});

app.post('/admin/bank', requireAuth, async (req, res) => {
  try {
    const { bank_name, account_number, routing_number, account_holder } = req.body;
    const bankInfo = JSON.stringify({
      bank_name,
      account_number: '****' + account_number.slice(-4),
      routing_number: '****' + routing_number.slice(-4),
      account_holder
    });

    await database.updateUserBankInfo(req.session.userId, bankInfo);
    res.redirect('/admin/dashboard');
  } catch (error) {
    res.status(500).render('error', { message: 'Error updating bank info' });
  }
});

// Account Settings
app.get('/admin/settings', requireAuth, async (req, res) => {
  try {
    const user = await database.getUserById(req.session.userId);
    res.render('admin/settings', { user });
  } catch (error) {
    res.status(500).render('error', { message: 'Error loading settings' });
  }
});

app.post('/admin/settings', requireAuth, async (req, res) => {
  try {
    const { currentPassword, username, newPassword, confirmPassword } = req.body;
    const user = await database.getUserById(req.session.userId);

    // Verify current password
    const isValid = await database.verifyUserPassword(req.session.userId, currentPassword);
    if (!isValid) {
      return res.render('admin/settings', {
        user,
        error: 'Current password is incorrect'
      });
    }

    // Check passwords match
    if (newPassword !== confirmPassword) {
      return res.render('admin/settings', {
        user,
        error: 'New passwords do not match'
      });
    }

    // Check password length
    if (newPassword.length < 6) {
      return res.render('admin/settings', {
        user,
        error: 'Password must be at least 6 characters'
      });
    }

    // Update credentials
    await database.updateUserCredentials(req.session.userId, username, newPassword);

    res.render('admin/settings', {
      user: { ...user, username },
      success: true
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).render('error', { message: 'Error updating settings' });
  }
});

// Download endpoint
app.get('/download/:saleId', async (req, res) => {
  try {
    const sale = await database.getSaleById(req.params.saleId);
    if (!sale) {
      return res.status(404).render('404');
    }

    if (sale.type === 'album') {
      const songs = await database.getSongsByAlbumId(sale.album_id);
      res.render('download', { sale, songs });
    } else {
      const song = await database.getSongById(sale.song_id);
      res.render('download', { sale, songs: [song] });
    }
  } catch (error) {
    res.status(404).render('404');
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    message: 'Something went wrong! Please try again later.'
  });
});

app.use((req, res) => {
  res.status(404).render('404');
});

// Helper functions
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

async function sendThankYouEmail(email, name, album, saleId, amount, discount = 0, song = null) {
  try {
    const subject = song ?
      `Thank you for purchasing "${song.title}"` :
      `Thank you for purchasing "${album.title}"`;

    const downloadUrl = `${process.env.PUBLIC_BASE_URL || process.env.APP_URL || 'http://localhost:5000'}/download/${saleId}`;
    const reviewUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || 'http://localhost:5000';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ff5500;">Thank You for Your Purchase!</h1>
        <p>Dear ${name || 'Valued Customer'},</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <h3>Purchase Details:</h3>
          ${song ?
        `<p><strong>Song:</strong> ${song.title}</p>
             <p><strong>Price:</strong> $${song.price.toFixed(2)}</p>` :
        `<p><strong>Album:</strong> ${album.title}</p>
             <p><strong>Price:</strong> $${amount.toFixed(2)} ${discount > 0 ? `(${discount * 100}% discount applied)` : ''}</p>`
      }
          <p><strong>Transaction ID:</strong> ${saleId}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${downloadUrl}" style="
            background: #ff5500; 
            color: white; 
            padding: 15px 30px; 
            text-decoration: none; 
            border-radius: 25px;
            display: inline-block;
            font-weight: bold;
          ">Download Your Music</a>
        </div>
        
        <p>Your download link: <a href="${downloadUrl}">${downloadUrl}</a></p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p>Discover more music: <a href="${reviewUrl}">${reviewUrl}</a></p>
          <p style="color: #666; font-size: 14px;">This is an automated message, please do not reply.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"Music Portfolio" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subject,
      html: html
    });

    console.log(`Thank you email sent to ${email}`);
  } catch (error) {
    console.error('Email error:', error);
  }
}

// Initialize and start server
database.initialize().then(async () => {
  await searchEngine.initialize();

  app.listen(PORT, '0.0.0.0', () => {
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `http://localhost:${PORT}`;
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit: ${baseUrl}`);
    console.log(`Admin login: admin / admin123 (Change immediately!)`);
  });
}).catch(err => {
  console.error('Database initialization failed:', err);
});
