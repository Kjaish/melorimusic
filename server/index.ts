import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { spawn } from 'child_process';
import 'dotenv/config';
import { runMigrations } from 'stripe-replit-sync';
// Battle and Networking features removed
// import networkingRoutes from './networking/routes';
// import setupNetworkingSocket from './networking/socketHandler';

// Import database and search modules
import { getAuthProvider } from './dbProvider';

// Import database and search modules
import database from '../database.js';
import pgDatabase from './pg-database.js';
import searchEngine from '../search-engine.js';
import { getUncachableStripeClient, getStripeSync, getStripePublishableKey } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';
import { registerObjectStorageRoutes, ObjectStorageService } from './replit_integrations/object_storage';
import { sendFeedbackEmail, sendSaleNotificationEmail, sendPurchaseConfirmationEmail } from './email-client';

// Object Storage service for persistent audio storage
const objectStorageService = new ObjectStorageService();

// Helper function to get the public base URL

// Helper function to get the public base URL
function getPublicBaseUrl(req?: express.Request): string {
  // In production, PUBLIC_BASE_URL is REQUIRED to prevent localhost issues
  if (process.env.NODE_ENV === 'production' && !process.env.PUBLIC_BASE_URL) {
    console.error('CRITICAL: PUBLIC_BASE_URL must be set in production environment');
    throw new Error('PUBLIC_BASE_URL environment variable is required in production');
  }

  // Priority: PUBLIC_BASE_URL env var > REPLIT_DOMAINS > request host > development fallback
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL;
  }
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`;
  }
  if (req) {
    // Use x-forwarded-proto header set by Nginx reverse proxy
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('x-forwarded-host') || req.get('host');
    return `${protocol}://${host}`;
  }
  // Development-only fallback
  if (process.env.NODE_ENV === 'development') {
    return `http://localhost:${PORT}`;
  }
  // Should never reach here in production
  return '';
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const PORT = parseInt(process.env.PORT || '5000', 10);

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Initialize Stripe
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log('DATABASE_URL not set - Stripe integration disabled');
    return false;
  }

  try {
    console.log('Initializing Stripe schema...');
    await runMigrations({ databaseUrl } as any);
    console.log('Stripe schema ready');

    const stripeSync = await getStripeSync();

    console.log('Setting up managed webhook...');
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    try {
      const result = await stripeSync.findOrCreateManagedWebhook(
        `${webhookBaseUrl}/api/stripe/webhook`
      );
      if (result && result.webhook) {
        console.log(`Webhook configured: ${result.webhook.url}`);
      } else {
        console.log('Webhook setup skipped - will be configured on first request');
      }
    } catch (webhookError: any) {
      console.log('Webhook setup deferred:', webhookError.message);
    }

    console.log('Syncing Stripe data...');
    stripeSync.syncBackfill().then(() => {
      console.log('Stripe data synced');
    }).catch((err: any) => {
      console.error('Error syncing Stripe data:', err);
    });

    return true;
  } catch (error) {
    console.error('Failed to initialize Stripe:', error);
    return false;
  }
}

// Initialize Stripe on startup
let stripeEnabled = false;
initStripe().then(enabled => {
  stripeEnabled = enabled;
});

// Checkout Session Endpoint
app.post('/api/checkout/session', async (req: any, res) => {
  if (!req.user && !req.session?.userId) {
    return res.status(401).json({ error: 'You must be logged in to make a purchase' });
  }

  const userId = req.user?.id || req.session.userId;
  const userEmail = req.user?.email;
  const { type, itemId, amount } = req.body; // type: 'donation' | 'song' | 'album'

  if (!type) {
    return res.status(400).json({ error: 'Missing purchase type' });
  }

  try {
    const db = getAuthProvider();
    const stripe = await getUncachableStripeClient();

    let lineItems = [];
    let metadata: any = {
      user_id: userId,
      type: type,
      customer_email: userEmail
    };

    let mode: 'payment' | 'subscription' = 'payment';
    let computedAmount = 0;

    if (type === 'donation') {
      const amountCents = parseInt(amount);
      if (isNaN(amountCents) || amountCents < 50) { // Min 50 cents
        return res.status(400).json({ error: 'Invalid donation amount (min $0.50)' });
      }
      computedAmount = amountCents;
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Donation to Melori Platform',
            description: 'Support the community'
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      });
      metadata.item_id = 'donation';
    } else if (type === 'album') {
      if (!itemId) return res.status(400).json({ error: 'Missing Album ID' });
      const album = await (db as any).getAlbumWithStorefront(parseInt(itemId)); // Cast for TS
      if (!album) return res.status(404).json({ error: 'Album not found' });

      // Handle free albums? 
      const priceCents = Math.round((album.price || 10) * 100);
      computedAmount = priceCents;

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Album: ${album.title}`,
            metadata: { album_id: album.id }
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      });
      metadata.album_id = album.id;
      metadata.item_id = album.id;

    } else if (type === 'song') {
      if (!itemId) return res.status(400).json({ error: 'Missing Song ID' });
      const song = await (db as any).getSongWithStorefront(parseInt(itemId));
      if (!song) return res.status(404).json({ error: 'Song not found' });

      const priceCents = Math.round((song.price || 1) * 100);
      computedAmount = priceCents;

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Song: ${song.title}`,
            metadata: { song_id: song.id }
          },
          unit_amount: priceCents,
        },
        quantity: 1,
      });
      metadata.song_id = song.id;
      metadata.item_id = song.id;
    } else {
      return res.status(400).json({ error: 'Invalid item type' });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: mode,
      success_url: `${getPublicBaseUrl(req)}/support/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getPublicBaseUrl(req)}/music`, // TODO: Better cancel URL
      customer_email: userEmail,
      metadata: metadata,
      expand: ['payment_intent']
    });

    // Create Pending Order
    await (db as any).createOrder({
      id: `ord_${Date.now()}_${require('crypto').randomBytes(4).toString('hex')}`,
      userId: userId,
      orderType: type,
      itemId: String(itemId || 'donation'),
      amountTotal: computedAmount,
      currency: 'usd',
      status: 'pending',
      stripeCheckoutSessionId: session.id
    });

    res.json({ url: session.url });

  } catch (error: any) {
    console.error('Checkout Session Creation Error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Register Stripe webhook route BEFORE express.json()
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// Secure Download Endpoint
app.get('/download', async (req, res) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).send('Invalid download token');
  }

  try {
    const db = getAuthProvider();
    const downloadToken = await (db as any).getDownloadToken(token); // Cast for TS

    if (!downloadToken) {
      return res.status(404).send('Download link invalid or expired');
    }

    if (downloadToken.expiresAt < Date.now()) {
      return res.status(410).send('Download link expired');
    }

    const { entitlementType, itemId } = downloadToken;

    if (entitlementType === 'song') {
      const song = await db.getSongById(parseInt(itemId));
      if (!song || !song.file_path) {
        return res.status(404).send('Song file not found');
      }

      const signedUrl = await objectStorageService.getSignedUrl(song.file_path, 3600); // 1 hour validity
      return res.redirect(signedUrl);

    } else if (entitlementType === 'album') {
      // For albums, redirect to the album page for now (or implement zip download later)
      return res.redirect(`/album/${itemId}`);
    } else {
      return res.status(400).send('Unknown item type');
    }

  } catch (error) {
    console.error('Download Error:', error);
    res.status(500).send('Download failed');
  }
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com", "https://connect.stripe.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "https://connect.stripe.com"]
    }
  }
}));
app.use(compression());
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// Session configuration - use MemoryStore for SQLite, PgSession for PostgreSQL
import memorystore from 'memorystore';
const MemoryStore = memorystore(session);
const PgSession = connectPgSimple(session);

const sessionConfig: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to false for development; Replit handles HTTPS at proxy level
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax' as const
  }
};

// Use PostgreSQL session store only for PostgreSQL databases, otherwise use MemoryStore
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgresql://')) {
  console.log('Using PostgreSQL session store');
  sessionConfig.store = new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true
  });
} else {
  console.log('Using in-memory session store (SQLite/local development)');
  sessionConfig.store = new MemoryStore({
    checkPeriod: 86400000 // prune expired entries every 24h
  });
}

app.use(session(sessionConfig));

// CSRF Protection Middleware
const generateCsrfToken = (req: any) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
};

const csrfMiddleware = (req: any, res: any, next: any) => {
  // Make CSRF token available to all views
  res.locals.csrfToken = generateCsrfToken(req);
  next();
};

const validateCsrf = (req: any, res: any, next: any) => {
  // Skip CSRF validation for webhook endpoints and API calls with JSON
  if (req.path.includes('/api/stripe/webhook') ||
    req.path.includes('/api/search/suggest')) {
    return next();
  }

  const token = req.body._csrf || req.headers['x-csrf-token'];
  const sessionToken = req.session.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    console.error('CSRF token mismatch:', { path: req.path, token: token?.substring(0, 8), sessionToken: sessionToken?.substring(0, 8) });
    return res.status(403).render('error', { message: 'Invalid security token. Please refresh the page and try again.' });
  }

  next();
};

app.use(csrfMiddleware);

// File upload configuration - images go to disk, audio goes to memory for Object Storage upload
const imageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'albumArt' || file.fieldname === 'coverArt') {
      cb(null, path.join(rootDir, 'public/uploads/album_art/'));
    } else if (file.fieldname === 'avatar') {
      cb(null, path.join(rootDir, 'public/uploads/avatars/'));
    } else if (file.fieldname === 'logo' || file.fieldname === 'banner') {
      cb(null, path.join(rootDir, 'public/uploads/'));
    } else {
      cb(null, path.join(rootDir, 'public/uploads/'));
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// Multer storage that handles both images (disk) and audio (memory for Object Storage)
const hybridStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'albumArt' || file.fieldname === 'coverArt') {
      cb(null, path.join(rootDir, 'public/uploads/album_art/'));
    } else if (file.fieldname === 'avatar') {
      cb(null, path.join(rootDir, 'public/uploads/avatars/'));
    } else if (file.fieldname === 'logo' || file.fieldname === 'banner') {
      cb(null, path.join(rootDir, 'public/uploads/'));
    } else if (file.fieldname === 'musicFiles' || file.fieldname === 'audioFile' || file.fieldname === 'songs') {
      // Audio files temporarily stored - will be uploaded to Object Storage
      cb(null, path.join(rootDir, 'public/uploads/temp/'));
    } else {
      cb(null, path.join(rootDir, 'public/uploads/'));
    }
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: hybridStorage,
  limits: {
    fileSize: 500 * 1024 * 1024,  // 500MB per file
    files: 51,  // 50 songs + 1 cover art
    fieldSize: 500 * 1024 * 1024  // 500MB field size
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'albumArt' || file.fieldname === 'coverArt' || file.fieldname === 'logo' || file.fieldname === 'banner' || file.fieldname === 'avatar') {
      const allowedTypes = /jpeg|jpg|png|gif|webp/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      if (mimetype && extname) {
        return cb(null, true);
      }
      cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'));
    } else if (file.fieldname === 'musicFiles' || file.fieldname === 'audioFile' || file.fieldname === 'songs') {
      const allowedTypes = /mp3|wav|m4a|flac|ogg/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      if (extname) {
        return cb(null, true);
      }
      cb(new Error('Only audio files are allowed (MP3, WAV, M4A, FLAC, OGG)'));
    } else {
      cb(null, true);
    }
  }
});

// Helper to upload audio file to Object Storage and clean up temp file
async function uploadAudioToObjectStorage(tempFilePath: string, originalFilename: string, contentType: string): Promise<string> {
  const fs = await import('fs');
  try {
    const buffer = await fs.promises.readFile(tempFilePath);
    const result = await objectStorageService.uploadBuffer(buffer, originalFilename, contentType, 'music');
    // Clean up temp file
    await fs.promises.unlink(tempFilePath).catch(() => { });
    return result.objectPath;
  } catch (error) {
    // Clean up temp file on error
    await fs.promises.unlink(tempFilePath).catch(() => { });
    throw error;
  }
}

// Storefront uploads middleware
const storefrontUpload = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'banner', maxCount: 1 }
]);

// Middleware - configure for large file uploads (500MB total for multi-file uploads)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));
app.use(express.raw({ limit: '500mb', type: 'application/octet-stream' }));

// Configure MIME types for static assets
const mimeTypes = {
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm'
};

const staticOptions = {
  setHeaders: (res: any, path: string) => {
    const ext = path.substring(path.lastIndexOf('.'));
    if (mimeTypes[ext as keyof typeof mimeTypes]) {
      res.setHeader('Content-Type', mimeTypes[ext as keyof typeof mimeTypes]);
    }
    // Add cache headers for static assets
    if (['.js', '.css', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.wasm', '.webp', '.svg'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
};

// Serve public directory (uploads, static files)
app.use(express.static(path.join(rootDir, 'public'), staticOptions));

// Serve built frontend assets in production
// Priority: dist/public (production build) > public directory
if (process.env.NODE_ENV === 'production') {
  const distPublicPath = path.join(rootDir, 'dist', 'public');
  app.use(express.static(distPublicPath, {
    ...staticOptions,
    maxAge: '1d',
    etag: false,
    index: false // Disable default index.html serving to allow server-side routing for /
  }));
}

// Audio file serving with range request support for streaming
app.get('/uploads/music_files/:album/:filename', (req, res) => {
  const { album, filename } = req.params;
  const filePath = path.join(rootDir, 'public', 'uploads', 'music_files', album, filename);

  // Security: prevent directory traversal
  const normalizedPath = path.normalize(filePath);
  const uploadsDir = path.join(rootDir, 'public', 'uploads', 'music_files');
  if (!normalizedPath.startsWith(uploadsDir)) {
    return res.status(403).send('Forbidden');
  }

  // Check if file exists
  import('fs').then(fs => {
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Audio file not found');
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Set CORS headers for audio streaming
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      // Handle range requests for seeking
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'audio/mpeg',
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      // Serve full file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
      });

      fs.createReadStream(filePath).pipe(res);
    }
  });
});

app.set('view engine', 'ejs');
app.set('views', path.join(rootDir, 'views'));

// Increase timeout for large uploads (10 minutes)
app.use((req: any, res: any, next: any) => {
  req.setTimeout(600000); // 10 minutes
  res.setTimeout(600000);
  next();
});

// Multer error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).render('error', { message: 'File too large. Maximum size is 500MB per file.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).render('error', { message: 'Too many files. Maximum is 50 songs per upload.' });
  }
  if (err.type === 'entity.too.large' || err.message?.includes('request entity too large')) {
    return res.status(400).render('error', { message: 'Upload too large. Try uploading fewer files at once, or use smaller file sizes.' });
  }
  if (err.name === 'MulterError') {
    return res.status(400).render('error', { message: 'Upload error: ' + err.message });
  }
  next(err);
});

// Authentication middleware
const requireAuth = (req: any, res: any, next: any) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Role-based authentication middleware
const requireRole = (...roles: string[]) => {
  return async (req: any, res: any, next: any) => {
    if (!req.session.userId) {
      return res.redirect('/login');
    }

    try {
      const user = await pgDatabase.getUserById(req.session.userId);
      if (!user) {
        req.session.destroy();
        return res.redirect('/login');
      }

      if (roles.length > 0 && !roles.includes(user.role)) {
        return res.status(403).render('error', {
          message: 'You do not have permission to access this page.'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.redirect('/login');
    }
  };
};

// Artist-only routes middleware
const requireArtist = requireRole('artist', 'label_admin', 'platform_admin');

// Admin-only routes middleware  
const requirePlatformAdmin = requireRole('platform_admin');

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Routes
app.get('/', async (req: any, res) => {
  try {
    const db = getAuthProvider();
    const albums = await database.getAllAlbums();
    const singles = await database.getAllSingles();
    res.render('index', {
      albums,
      singles,
      user: req.session.userId ? await db.getUserById(req.session.userId) : null,
      searchQuery: '',
      isAdmin: !!req.session.userId
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading albums');
  }
});

app.get('/music', async (req: any, res) => {
  try {
    const db = getAuthProvider();
    const albums = await database.getAllAlbums();
    const singles = await database.getAllSingles();
    res.render('music', {
      albums,
      singles,
      user: req.session.userId ? await db.getUserById(req.session.userId) : null,
      isAdmin: !!req.session.userId
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error loading music catalog');
  }
});

app.get('/about', async (req: any, res) => {
  const db = getAuthProvider();
  res.render('about', {
    user: req.session.userId ? await db.getUserById(req.session.userId) : null
  });
});

// Terms of Service
app.get('/terms', async (req: any, res) => {
  const db = getAuthProvider();
  res.render('terms', {
    user: req.session.userId ? await db.getUserById(req.session.userId) : null
  });
});

// Privacy Policy
app.get('/privacy', async (req: any, res) => {
  const db = getAuthProvider();
  res.render('privacy', {
    user: req.session.userId ? await db.getUserById(req.session.userId) : null
  });
});

// Support/Donation page
app.get('/support', async (req: any, res) => {
  try {
    const db = getAuthProvider();
    const stripePublicKey = await getStripePublishableKey();
    res.render('support', {
      user: req.session.userId ? await db.getUserById(req.session.userId) : null,
      stripePublicKey: stripePublicKey || '',
      raised: 2250,
      goal: 5000
    });
  } catch (error) {
    console.error('Error loading support page:', error);
    res.status(500).send('Error loading support page');
  }
});

// Success page for donations
app.get('/support/success', async (req: any, res) => {
  const db = getAuthProvider();
  const amount = req.query.amount || 0;
  res.render('support-success', {
    user: req.session.userId ? await db.getUserById(req.session.userId) : null,
    amount
  });
});

// Donation payment intent endpoint
app.post('/api/create-donation-intent', async (req: any, res) => {
  try {
    const { amount, paymentType, email, name } = req.body;

    if (!amount || amount < 100) {
      return res.status(400).json({ error: 'Minimum donation is $1' });
    }

    const stripe = await getUncachableStripeClient();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      metadata: {
        paymentType: paymentType || 'donation',
        email: email || '',
        name: name || ''
      }
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error: any) {
    console.error('Donation payment error:', error);
    res.status(500).json({ error: error.message || 'Payment processing failed' });
  }
});

// Battle and Networking features removed - redirect to music page
app.get('/battle', (req, res) => res.redirect('/music'));
app.get('/networking', (req, res) => res.redirect('/music'));

// Register Object Storage routes
registerObjectStorageRoutes(app);

app.get('/feedback', async (req: any, res) => {
  try {
    const db = getAuthProvider();
    const comments = await db.getPublicComments(50);
    res.render('feedback', {
      user: req.session.userId ? await db.getUserById(req.session.userId) : null,
      success: req.query.success === 'true',
      error: null,
      comments: comments
    });
  } catch (error) {
    console.error('Error loading feedback page:', error);
    const db = getAuthProvider();
    res.render('feedback', {
      user: req.session.userId ? await db.getUserById(req.session.userId) : null,
      success: false,
      error: null,
      comments: []
    });
  }
});

app.post('/feedback', async (req: any, res) => {
  try {
    const db = getAuthProvider();
    const { email, name, subject, message, rating } = req.body;
    const comments = await db.getPublicComments(50);

    if (!email || !message) {
      return res.render('feedback', {
        user: req.session.userId ? await db.getUserById(req.session.userId) : null,
        success: false,
        error: 'Email and message are required.',
        comments: comments
      });
    }

    await db.createFeedback({
      email,
      name: name || null,
      subject: subject || 'general',
      message,
      rating: rating ? parseInt(rating) : null
    });

    // If the feedback is a compliment, also add it as a public comment
    if (subject === 'praise' && name) {
      await db.createPublicComment(name, message);
    }

    // Send email notification to melorimusicplatform@gmail.com
    try {
      await sendFeedbackEmail({
        email,
        name: name || undefined,
        subject: subject || 'general',
        message,
        rating: rating ? parseInt(rating) : undefined
      });
    } catch (emailError) {
      console.error('Failed to send feedback email:', emailError);
    }

    res.redirect('/feedback?success=true');
  } catch (error) {
    console.error('Error submitting feedback:', error);
    const comments = await pgDatabase.getPublicComments(50);
    res.render('feedback', {
      user: req.session.userId ? await pgDatabase.getUserById(req.session.userId) : null,
      success: false,
      error: 'An error occurred. Please try again.',
      comments: comments
    });
  }
});

// Public: Promo Code Redemption Page
app.get('/redeem', async (req: any, res) => {
  try {
    const user = req.session?.userId ? await pgDatabase.getUserById(req.session.userId) : null;
    const success = req.query.success === 'true';
    const redemptionId = req.query.redemptionId;

    if (success && redemptionId) {
      // Get redemption details to show downloads
      const redemption = await pgDatabase.getPromoRedemptionById(parseInt(redemptionId));

      if (redemption) {
        let songs: any[] = [];

        // Get songs based on reward type
        if (redemption.reward_type === 'album' && redemption.reward_item_id) {
          songs = await pgDatabase.getSongsByAlbumId(redemption.reward_item_id);
        } else if (redemption.reward_type === 'single' && redemption.reward_item_id) {
          const single = await pgDatabase.getSingleById(redemption.reward_item_id);
          if (single) {
            songs = [{
              id: single.id,
              title: single.title,
              file_path: single.file_path
            }];
          }
        }

        return res.render('redeem', {
          user,
          success: true,
          error: null,
          redemption: {
            id: redemption.id,
            campaignName: redemption.campaign_name || 'Promo Reward'
          },
          songs
        });
      }
    }

    res.render('redeem', {
      user,
      success: false,
      error: req.query.error || null,
      redemption: null,
      songs: []
    });
  } catch (error) {
    console.error('Error loading redeem page:', error);
    res.render('redeem', {
      user: null,
      success: false,
      error: 'An error occurred. Please try again.',
      redemption: null,
      songs: []
    });
  }
});

// Public Comments API
app.get('/api/comments', async (req, res) => {
  try {
    const comments = await pgDatabase.getPublicComments(50);
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

app.post('/api/comments', async (req, res) => {
  try {
    const { name, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({ error: 'Name and message are required' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Name is too long (max 100 characters)' });
    }

    if (message.length > 500) {
      return res.status(400).json({ error: 'Message is too long (max 500 characters)' });
    }

    const comment = await pgDatabase.createPublicComment(name.trim(), message.trim());
    res.json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

app.delete('/api/comments/:id', requirePlatformAdmin, async (req: any, res) => {
  try {
    await pgDatabase.deletePublicComment(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// ==================== ANALYTICS API ====================

// Log analytics event (page view, click, time spent)
app.post('/api/analytics/event', async (req: any, res) => {
  try {
    const { event_type, page_path, target_element, target_id, duration_ms, session_id, metadata } = req.body;

    if (!event_type) {
      return res.status(400).json({ error: 'event_type is required' });
    }

    const db = getAuthProvider();
    const user = req.session?.userId ? await db.getUserById(req.session.userId) : null;

    const eventData = {
      user_id: user?.id || null,
      email: user?.email || null,
      session_id: session_id || null,
      event_type,
      page_path: page_path || null,
      target_element: target_element || null,
      target_id: target_id || null,
      duration_ms: duration_ms || null,
      metadata: metadata || {},
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.headers['user-agent']
    };

    await db.logAnalyticsEvent(eventData);
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging analytics event:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

// Get or create session for tracking
app.post('/api/analytics/session', async (req: any, res) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const db = getAuthProvider();
    const user = req.session?.userId ? await db.getUserById(req.session.userId) : null;

    const session = await db.getOrCreateSession({
      user_id: user?.id || null,
      email: user?.email || null,
      session_id,
      ip_address: req.ip || req.connection?.remoteAddress,
      user_agent: req.headers['user-agent']
    });

    res.json(session);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Update session activity (heartbeat)
app.post('/api/analytics/heartbeat', async (req: any, res) => {
  try {
    const { session_id, duration_ms } = req.body;

    if (!session_id) {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const db = getAuthProvider();
    await db.updateSessionActivity(session_id, duration_ms || 0);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Admin: Get analytics summary
app.get('/api/admin/analytics/summary', requirePlatformAdmin, async (req: any, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const db = getAuthProvider();
    const summary = await db.getAnalyticsSummary(days);
    res.json(summary);
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Admin: Get top pages
app.get('/api/admin/analytics/pages', requirePlatformAdmin, async (req: any, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 20;
    const pages = await pgDatabase.getTopPagesByViews(days, limit);
    res.json(pages);
  } catch (error) {
    console.error('Error fetching top pages:', error);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// Admin: Get user engagement by email
app.get('/api/admin/analytics/engagement', requirePlatformAdmin, async (req: any, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const limit = parseInt(req.query.limit as string) || 50;
    const engagement = await pgDatabase.getUserEngagement(days, limit);
    res.json(engagement);
  } catch (error) {
    console.error('Error fetching user engagement:', error);
    res.status(500).json({ error: 'Failed to fetch engagement' });
  }
});

// Admin: Get recent events
app.get('/api/admin/analytics/events', requirePlatformAdmin, async (req: any, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const events = await pgDatabase.getRecentAnalyticsEvents(limit);
    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// ==================== PROMO CODE API ====================

// Public: Validate promo code (check if valid without redeeming)
app.post('/api/promo/validate', async (req: any, res) => {
  try {
    const { keyword, code } = req.body;

    if (!keyword || !code) {
      return res.status(400).json({ valid: false, error: 'Keyword and code are required' });
    }

    const result = await pgDatabase.validatePromoCode(keyword, code);
    res.json(result);
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({ valid: false, error: 'Failed to validate code' });
  }
});

// Public: Redeem promo code
app.post('/api/promo/redeem', async (req: any, res) => {
  try {
    const { keyword, code, email } = req.body;
    const ipAddress = req.ip || req.connection?.remoteAddress;

    if (!keyword || !code || !email) {
      return res.status(400).json({ valid: false, error: 'Keyword, code, and email are required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ valid: false, error: 'Invalid email address' });
    }

    // Check for disposable email
    if (pgDatabase.isDisposableEmail(email)) {
      return res.status(400).json({
        valid: false,
        error: 'Please use a valid email address. Temporary email services are not allowed.'
      });
    }

    // Check rate limit (5 attempts per hour)
    const rateLimit = await pgDatabase.checkRateLimit(email, 5);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        valid: false,
        error: `Too many redemption attempts. Please try again in ${rateLimit.minutesUntilReset} minutes.`
      });
    }

    const user = req.session?.userId ? await pgDatabase.getUserById(req.session.userId) : null;
    const result = await pgDatabase.redeemPromoCode(
      keyword,
      code,
      email,
      user?.id || null,
      ipAddress
    );

    // Log the attempt (success or failure)
    await pgDatabase.logRedemptionAttempt(email, ipAddress, keyword, code, result.valid && result.success);

    res.json(result);
  } catch (error) {
    console.error('Error redeeming promo code:', error);
    res.status(500).json({ valid: false, error: 'Failed to redeem code' });
  }
});

// Admin: Get all promo campaigns
app.get('/api/admin/promo/campaigns', requirePlatformAdmin, async (req: any, res) => {
  try {
    const includeInactive = req.query.all === 'true';
    const campaigns = await pgDatabase.getPromoCampaigns(includeInactive);
    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Admin: Get campaign by ID
app.get('/api/admin/promo/campaigns/:id', requirePlatformAdmin, async (req: any, res) => {
  try {
    const campaign = await pgDatabase.getPromoCampaignById(parseInt(req.params.id));
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const activeCodeCount = await pgDatabase.getActivePromoCodeCount(campaign.id);
    res.json({ ...campaign, active_codes: activeCodeCount });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// Admin: Create promo campaign
app.post('/api/admin/promo/campaigns', requirePlatformAdmin, async (req: any, res) => {
  try {
    const { keyword, name, description, reward_type, reward_item_id, expires_at, max_redemptions } = req.body;

    if (!keyword || !name || !reward_type) {
      return res.status(400).json({ error: 'Keyword, name, and reward_type are required' });
    }

    if (!['album', 'single', 'track', 'subscription', 'discount', 'merchandise'].includes(reward_type)) {
      return res.status(400).json({ error: 'reward_type must be one of: album, single, track, subscription, discount, merchandise' });
    }

    const campaign = await pgDatabase.createPromoCampaign({
      keyword,
      name,
      description,
      reward_type,
      reward_item_id: reward_item_id || null,
      expires_at: expires_at || null,
      max_redemptions: max_redemptions || 1000,
      created_by: req.session?.userId || null
    });

    res.json(campaign);
  } catch (error: any) {
    console.error('Error creating campaign:', error);
    if (error.message?.includes('unique')) {
      return res.status(400).json({ error: 'A campaign with this keyword already exists' });
    }
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Admin: Generate promo codes for a campaign
app.post('/api/admin/promo/campaigns/:id/generate', requirePlatformAdmin, async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const count = Math.min(parseInt(req.body.count) || 100, 1000); // Max 1000 at a time

    const campaign = await pgDatabase.getPromoCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const codes = await pgDatabase.generatePromoCodes(campaignId, count);
    res.json({
      success: true,
      generated: codes.length,
      message: `Generated ${codes.length} codes for campaign "${campaign.name}"`
    });
  } catch (error) {
    console.error('Error generating codes:', error);
    res.status(500).json({ error: 'Failed to generate codes' });
  }
});

// Admin: Get codes for a campaign
app.get('/api/admin/promo/campaigns/:id/codes', requirePlatformAdmin, async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const status = req.query.status as string || null;
    const limit = parseInt(req.query.limit as string) || 100;

    const codes = await pgDatabase.getPromoCodesByCampaign(campaignId, status, limit);
    res.json(codes);
  } catch (error) {
    console.error('Error fetching codes:', error);
    res.status(500).json({ error: 'Failed to fetch codes' });
  }
});

// Admin: Deactivate campaign
app.post('/api/admin/promo/campaigns/:id/deactivate', requirePlatformAdmin, async (req: any, res) => {
  try {
    const campaign = await pgDatabase.deactivatePromoCampaign(parseInt(req.params.id));
    res.json(campaign);
  } catch (error) {
    console.error('Error deactivating campaign:', error);
    res.status(500).json({ error: 'Failed to deactivate campaign' });
  }
});

// Admin: Delete campaign
app.delete('/api/admin/promo/campaigns/:id', requirePlatformAdmin, async (req: any, res) => {
  try {
    await pgDatabase.deletePromoCampaign(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// Admin: Get all redemptions
app.get('/api/admin/promo/redemptions', requirePlatformAdmin, async (req: any, res) => {
  try {
    const campaignId = req.query.campaign_id ? parseInt(req.query.campaign_id as string) : null;
    const limit = parseInt(req.query.limit as string) || 100;

    const redemptions = await pgDatabase.getPromoRedemptions(campaignId, limit);
    res.json(redemptions);
  } catch (error) {
    console.error('Error fetching redemptions:', error);
    res.status(500).json({ error: 'Failed to fetch redemptions' });
  }
});

// Admin: Get promo stats
app.get('/api/admin/promo/stats', requirePlatformAdmin, async (req: any, res) => {
  try {
    const stats = await pgDatabase.getPromoStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching promo stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/album/:id', async (req, res) => {
  try {
    const album = await database.getAlbumById(parseInt(req.params.id));
    const songs = await database.getSongsByAlbumId(parseInt(req.params.id));
    if (!album) {
      return res.status(404).render('404');
    }
    res.render('album', { album, songs, isAdmin: !!(req as any).session?.userId });
  } catch (error) {
    res.status(404).render('404');
  }
});

// Search Routes
app.get('/search', async (req: any, res) => {
  try {
    const query = (req.query.q as string) || '';
    let results: any[] = [];

    if (query.trim()) {
      results = await searchEngine.search(query);
      await database.logSearch(query, results.length);
    }

    res.render('search', {
      results,
      query,
      albums: results.filter((r: any) => r.type === 'album'),
      songs: results.filter((r: any) => r.type === 'song')
    });
  } catch (error) {
    console.error('Search error:', error);
    res.render('search', { results: [], query: req.query.q || '', albums: [], songs: [] });
  }
});

app.get('/api/search/suggest', async (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    if (query.length < 1) {
      return res.json([]);
    }

    const suggestions = await searchEngine.getSuggestions(query);
    res.json(suggestions);
  } catch (error) {
    res.json([]);
  }
});

// API Routes for frontend
app.post('/api/analytics/event', async (req, res) => {
  try {
    const { type, data } = req.body || {};

    // Log page views
    if (type === 'page_view' && data?.page) {
      const ip = req.ip || req.connection.remoteAddress || '0.0.0.0';
      const userAgent = req.get('User-Agent') || 'Unknown';
      await database.logTraffic(data.page, ip as string, userAgent);
    }
    // Log searches
    else if (type === 'search' && data?.query) {
      await database.logSearch(data.query, data.result_count || 0);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Analytics error:', error);
    // Return success to avoid blocking the frontend
    res.json({ success: true });
  }
});

app.get('/api/artist', async (_req, res) => {
  res.json({
    id: "artist-1",
    name: "Aurora Skye",
    tagline: "Ethereal soundscapes for the modern soul",
    bio: "Aurora Skye is an electronic music producer and composer known for creating immersive, atmospheric soundscapes that blur the line between ambient and dance music.\n\nBorn in the Pacific Northwest, Aurora's music draws from the natural beauty of misty forests, ocean tides, and starlit skies. Her productions combine organic textures with synthetic elements, creating a unique sonic signature that has captivated audiences worldwide.\n\nWith three studio albums and numerous EPs, Aurora has established herself as a pioneering force in the electronic music scene. Her live performances are known for their visual artistry and emotional depth, taking audiences on transformative journeys through sound and light.",
    heroImageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1920&h=1080&fit=crop",
    photoUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&h=1200&fit=crop",
    socialLinks: {
      spotify: "https://spotify.com",
      appleMusic: "https://music.apple.com",
      bandcamp: "https://bandcamp.com",
      instagram: "https://instagram.com",
      youtube: "https://youtube.com",
    },
  });
});

app.get('/api/albums', async (_req, res) => {
  try {
    const albums = await database.getAllAlbums();
    res.json(albums);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch albums' });
  }
});

app.get('/api/videos', async (_req, res) => {
  res.json([
    {
      id: "video-1",
      title: "Stellar Gateway - Official Music Video",
      thumbnailUrl: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1280&h=720&fit=crop",
      videoUrl: "https://youtube.com/watch?v=example1",
      views: 2450000,
      type: "music_video",
    },
    {
      id: "video-2",
      title: "Live at Red Rocks Amphitheatre",
      thumbnailUrl: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1280&h=720&fit=crop",
      videoUrl: "https://youtube.com/watch?v=example2",
      views: 890000,
      type: "live_performance",
    },
    {
      id: "video-3",
      title: "Making of Celestial Dreams",
      thumbnailUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=1280&h=720&fit=crop",
      videoUrl: "https://youtube.com/watch?v=example3",
      views: 156000,
      type: "behind_the_scenes",
    },
    {
      id: "video-4",
      title: "Nebula Rising - Visualizer",
      thumbnailUrl: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1280&h=720&fit=crop",
      videoUrl: "https://youtube.com/watch?v=example4",
      views: 1200000,
      type: "music_video",
    },
  ]);
});
app.get('/api/albums/:id', async (req, res) => {
  try {
    const album = await database.getAlbumById(parseInt(req.params.id));
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }
    res.json(album);
  } catch (error) {
    res.status(500).json({ error: 'Error loading album' });
  }
});

app.get('/api/albums/:id/songs', async (req, res) => {
  try {
    const songs = await database.getSongsByAlbumId(parseInt(req.params.id));
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: 'Error loading songs' });
  }
});

app.get('/api/songs/:id', async (req, res) => {
  try {
    const song = await database.getSongById(parseInt(req.params.id));
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }
    const album = await database.getAlbumById(song.album_id);
    res.json({ ...song, album_title: album?.title || 'Unknown Album' });
  } catch (error) {
    res.status(500).json({ error: 'Error loading song' });
  }
});

app.post('/api/songs/:id/play', async (req, res) => {
  try {
    // Track play count - could be expanded to update a play_count field
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error tracking play' });
  }
});

// Registration Routes
app.get('/register', (req, res) => {
  res.render('register', { error: null, email: '', username: '' });
});

app.post('/register', validateCsrf, async (req: any, res) => {
  const { email, username, password, confirmPassword, terms } = req.body;

  try {
    // Validation
    if (!email || !username || !password || !confirmPassword) {
      return res.render('register', {
        error: 'All fields are required',
        email,
        username
      });
    }

    if (password !== confirmPassword) {
      return res.render('register', {
        error: 'Passwords do not match',
        email,
        username
      });
    }

    if (password.length < 8) {
      return res.render('register', {
        error: 'Password must be at least 8 characters',
        email,
        username
      });
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username) || username.length < 3) {
      return res.render('register', {
        error: 'Username must be 3+ characters with only letters, numbers, and underscores',
        email,
        username
      });
    }

    if (!terms) {
      return res.render('register', {
        error: 'You must agree to the Terms of Service',
        email,
        username
      });
    }



    // Check if email already exists
    const authDb = getAuthProvider();
    const existingEmail = await authDb.getUserByEmail(email);
    if (existingEmail) {
      return res.render('register', {
        error: 'An account with this email already exists',
        email: '',
        username
      });
    }

    // Check if username already exists
    const existingUsername = await authDb.getUserByUsername(username);
    if (existingUsername) {
      return res.render('register', {
        error: 'This username is already taken',
        email,
        username: ''
      });
    }

    // Get visitor plan (default for all new registrations)
    const visitorPlan = await authDb.getPlanByName('visitor');

    // Create user as visitor (can listen, comment, review but not upload)
    const userId = await authDb.createUser({
      email,
      username,
      password,
      role: 'visitor',
      plan_id: visitorPlan?.id
    });

    // Create session
    req.session.userId = userId;
    req.session.role = 'visitor';
    req.session.planId = visitorPlan?.id;

    // Redirect visitors to music page (they can't upload, just listen/comment)
    res.redirect('/music');

  } catch (error: any) {
    console.error('Registration error:', error);
    res.render('register', {
      error: 'Registration failed. Please try again.',
      email: email || '',
      username: username || ''
    });
  }
});

// Login Routes
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', validateCsrf, async (req: any, res) => {
  const { username, password, rememberMe } = req.body;
  try {
    const authDb = getAuthProvider();
    // Use the determined provider for user lookup
    const user = await authDb.getUserByUsername(username);
    let isPasswordValid = false;

    if (user) {
      // Check password (supports both 'password' and 'password_hash' legacy field if any)
      isPasswordValid = await bcrypt.compare(password, user.password || user.password_hash);
    }

    if (user && isPasswordValid) {
      // Regenerate session to prevent session fixation attacks
      const oldSession = req.session;
      req.session.regenerate((err: any) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return res.render('login', { error: 'Login error. Please try again.' });
        }

        // Restore session data
        req.session.userId = user.id;
        req.session.role = user.role || 'artist';
        req.session.planId = user.plan_id;

        // Generate new CSRF token for the new session
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');

        // Extend session to 30 days if "remember me" is checked
        if (rememberMe) {
          req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        }

        // Save session before redirecting
        req.session.save((saveErr: any) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
          }
          res.redirect('/admin/dashboard');
        });
      });
    } else {
      res.render('login', { error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', { error: 'Login error. Please try again.' });
  }
});

app.get('/logout', (req: any, res) => {
  req.session.destroy((err: any) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/');
  });
});

// Password Reset Routes
app.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { error: null, success: false });
});

app.post('/forgot-password', validateCsrf, async (req: any, res) => {
  const { email } = req.body;

  try {
    const user = await pgDatabase.getUserByEmail(email);

    // Always show success to prevent email enumeration
    if (!user) {
      return res.render('forgot-password', { error: null, success: true });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Store token in database
    await pgDatabase.createPasswordResetToken(user.id, token, expiresAt);

    // Get the domain for the reset link
    const baseUrl = getPublicBaseUrl();
    const resetLink = `${baseUrl}/reset-password?token=${token}`;

    // Try to send email
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      if (process.env.SMTP_USER && process.env.SMTP_PASS) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@melorimusic.com',
          to: email,
          subject: 'Reset Your MELORI MUSIC Password',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a1a; color: #ffffff;">
              <div style="text-align: center; margin-bottom: 20px;">
                <h1 style="color: #ff5500;">MELORI MUSIC</h1>
              </div>
              <h2 style="color: #ffffff;">Reset Your Password</h2>
              <p style="color: #999999;">Hi ${user.username},</p>
              <p style="color: #999999;">We received a request to reset your password. Click the button below to create a new password:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" style="background: #ff5500; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
              </div>
              <p style="color: #666666; font-size: 12px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #333; margin: 20px 0;">
              <p style="color: #666666; font-size: 12px; text-align: center;">MELORI MUSIC - Your Music Marketplace</p>
            </div>
          `
        });
        console.log(`Password reset email sent to ${email}`);
      } else {
        // No SMTP configured, log the reset link for testing
        console.log(`[DEV] Password reset link for ${email}: ${resetLink}`);
      }
    } catch (emailErr) {
      console.error('Failed to send password reset email:', emailErr);
      // Still show success - don't reveal email configuration issues
    }

    res.render('forgot-password', { error: null, success: true });

  } catch (error) {
    console.error('Password reset request error:', error);
    res.render('forgot-password', { error: 'An error occurred. Please try again.', success: false });
  }
});

app.get('/reset-password', async (req: any, res) => {
  const { token } = req.query;

  if (!token) {
    return res.render('reset-password', { error: null, success: false, expired: true, token: '' });
  }

  try {
    const resetToken = await pgDatabase.getValidPasswordResetToken(token);

    if (!resetToken) {
      return res.render('reset-password', { error: null, success: false, expired: true, token: '' });
    }

    res.render('reset-password', { error: null, success: false, expired: false, token });
  } catch (error) {
    console.error('Reset password page error:', error);
    res.render('reset-password', { error: 'An error occurred.', success: false, expired: false, token: '' });
  }
});

app.post('/reset-password', validateCsrf, async (req: any, res) => {
  const { token, password, confirmPassword } = req.body;

  try {
    if (!token) {
      return res.render('reset-password', { error: 'Invalid reset link.', success: false, expired: true, token: '' });
    }

    if (!password || password.length < 8) {
      return res.render('reset-password', { error: 'Password must be at least 8 characters.', success: false, expired: false, token });
    }

    if (password !== confirmPassword) {
      return res.render('reset-password', { error: 'Passwords do not match.', success: false, expired: false, token });
    }

    const resetToken = await pgDatabase.getValidPasswordResetToken(token);

    if (!resetToken) {
      return res.render('reset-password', { error: null, success: false, expired: true, token: '' });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(password, 10);
    await pgDatabase.updateUserPassword(resetToken.user_id, hashedPassword);

    // Mark token as used
    await pgDatabase.markPasswordResetTokenUsed(token);

    console.log(`Password reset completed for user ${resetToken.email}`);
    res.render('reset-password', { error: null, success: true, expired: false, token: '' });

  } catch (error) {
    console.error('Password reset error:', error);
    res.render('reset-password', { error: 'An error occurred. Please try again.', success: false, expired: false, token });
  }
});

app.get('/admin/dashboard', requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const stats = await database.getDashboardStats();
    const albums = await database.getAllAlbums();
    const sales = await database.getRecentSales(10);
    const searches = await database.getRecentSearches(10);

    const albumCount = await database.getAlbumCount();
    const canUploadMore = albumCount < 50;

    const user = await pgDatabase.getUserById(userId);
    const userWithPlan = await pgDatabase.getUserWithPlan(userId);

    const earnings = await pgDatabase.getEarningsSummary(userId);
    const recentTransactions = await pgDatabase.getRecentTransactions(userId, 10);
    const pendingPayouts = await pgDatabase.getPendingPayoutsByUser(userId);

    const plan = userWithPlan ? await pgDatabase.getPlanById(userWithPlan.plan_id) : null;
    const payoutFrequency = plan?.payout_frequency || 'monthly';
    const commissionRate = plan?.commission_rate || 0.12;

    res.render('admin/dashboard', {
      stats,
      albums,
      sales,
      searches,
      albumCount,
      canUploadMore,
      maxAlbums: 50,
      user,
      userWithPlan,
      earnings: {
        total_gross: parseFloat(earnings?.total_gross || 0),
        total_commission: parseFloat(earnings?.total_commission || 0),
        total_net: parseFloat(earnings?.total_net || 0),
        pending_payout: parseFloat(earnings?.pending_payout || 0),
        paid_out: parseFloat(earnings?.paid_out || 0),
        total_transactions: parseInt(earnings?.total_transactions || 0)
      },
      recentTransactions,
      pendingPayouts: {
        pending_amount: parseFloat(pendingPayouts?.pending_amount || 0),
        transaction_count: parseInt(pendingPayouts?.transaction_count || 0)
      },
      payoutFrequency,
      commissionRate: (commissionRate * 100).toFixed(0),
      subscriptionSuccess: req.query.subscription === 'success'
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { message: 'Dashboard error' });
  }
});

// Album Management
app.get('/admin/albums', requireAuth, async (req: any, res) => {
  const albums = await database.getAllAlbums();
  const user = await pgDatabase.getUserById(req.session.userId);
  res.render('admin/albums', { albums, user });
});

app.get('/admin/albums/new', requireAuth, async (req: any, res) => {
  // Check plan-based upload limits
  const uploadCheck = await pgDatabase.canUserUpload(req.session.userId);
  if (!uploadCheck.allowed) {
    return res.render('error', {
      message: 'Uploading is not available for visitor accounts.'
    });
  }
  const user = await pgDatabase.getUserById(req.session.userId);
  res.render('admin/album-form', { album: null, edit: false, user });
});

app.get('/admin/albums/edit/:id', requireAuth, async (req: any, res) => {
  try {
    const album = await database.getAlbumById(parseInt(req.params.id));
    const songs = await database.getSongsByAlbumId(parseInt(req.params.id));
    const user = await pgDatabase.getUserById(req.session.userId);
    res.render('admin/album-form', { album, songs, edit: true, user });
  } catch (error) {
    res.redirect('/admin/albums');
  }
});

app.post('/admin/albums', requireAuth, upload.fields([
  { name: 'albumArt', maxCount: 1 },
  { name: 'songs', maxCount: 50 }
]), async (req: any, res) => {
  try {
    // Check plan-based upload limits
    const uploadCheck = await pgDatabase.canUserUpload(req.session.userId);
    if (!uploadCheck.allowed) {
      return res.status(400).render('error', {
        message: 'Uploading is not available for visitor accounts.'
      });
    }

    const { title, description, price, releaseDate } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const albumArt = files['albumArt'] ? files['albumArt'][0].filename : 'default.jpg';

    const albumId = await database.createAlbum({
      title,
      description,
      price: price || 8.00,
      album_art: albumArt,
      release_date: releaseDate,
      user_id: req.session.userId
    });

    if (files['songs']) {
      let trackNumber = 1;
      const scriptPath = path.join(rootDir, 'scripts', 'analyze_audio.py');

      for (const file of files['songs']) {
        const songTitle = file.originalname.replace(path.extname(file.originalname), '');
        const tempFilePath = file.path;

        // Upload audio to Object Storage
        let objectPath: string;
        try {
          objectPath = await uploadAudioToObjectStorage(tempFilePath, file.originalname, file.mimetype || 'audio/mpeg');
          console.log(`Uploaded ${file.originalname} to Object Storage: ${objectPath}`);
        } catch (uploadError) {
          console.error(`Failed to upload ${file.originalname} to Object Storage:`, uploadError);
          continue; // Skip this file
        }

        const songId = await database.createSong({
          album_id: albumId,
          title: songTitle,
          file_path: objectPath, // Store Object Storage path
          price: 0.99,
          track_number: trackNumber
        });

        // Auto-analyze audio for tempo and duration
        try {
          const tempFile = await objectStorageService.downloadToTempFile(objectPath);
          const analysis = await analyzeAudioFile(tempFile, scriptPath);
          // Clean up temp file
          const fs = await import('fs');
          await fs.promises.unlink(tempFile).catch(() => { });

          if (analysis.tempo || analysis.duration) {
            await database.updateSong(songId, {
              duration: analysis.duration ? Math.round(analysis.duration) : null,
              tempo: analysis.tempo
            });
            console.log(`Analyzed song ${songId}: tempo=${analysis.tempo}, duration=${analysis.duration}`);
          }
        } catch (analysisError) {
          console.error(`Failed to analyze song ${songId}:`, analysisError);
        }

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
  { name: 'albumArt', maxCount: 1 },
  { name: 'songs', maxCount: 50 }
]), async (req: any, res) => {
  try {
    const albumId = parseInt(req.params.id);
    const { title, description, price, releaseDate } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const albumData: any = {
      title,
      description,
      price: price || 8.00,
      release_date: releaseDate
    };

    if (files['albumArt']) {
      albumData.album_art = files['albumArt'][0].filename;
    }

    await database.updateAlbum(albumId, albumData);

    // Add new songs if uploaded
    if (files['songs'] && files['songs'].length > 0) {
      // Get existing songs to determine next track number
      const existingSongs = await database.getSongsByAlbumId(albumId);
      let trackNumber = existingSongs.length + 1;
      const scriptPath = path.join(rootDir, 'scripts', 'analyze_audio.py');

      for (const file of files['songs']) {
        const songTitle = file.originalname.replace(path.extname(file.originalname), '');
        const tempFilePath = file.path;

        // Upload audio to Object Storage
        let objectPath: string;
        try {
          objectPath = await uploadAudioToObjectStorage(tempFilePath, file.originalname, file.mimetype || 'audio/mpeg');
          console.log(`Uploaded ${file.originalname} to Object Storage: ${objectPath}`);
        } catch (uploadError) {
          console.error(`Failed to upload ${file.originalname} to Object Storage:`, uploadError);
          continue; // Skip this file
        }

        const songId = await database.createSong({
          album_id: albumId,
          title: songTitle,
          file_path: objectPath, // Store Object Storage path
          price: 0.99,
          track_number: trackNumber
        });

        // Auto-analyze audio for tempo and duration
        try {
          const tempFile = await objectStorageService.downloadToTempFile(objectPath);
          const analysis = await analyzeAudioFile(tempFile, scriptPath);
          // Clean up temp file
          const fs = await import('fs');
          await fs.promises.unlink(tempFile).catch(() => { });

          if (analysis.tempo || analysis.duration) {
            await database.updateSong(songId, {
              duration: analysis.duration ? Math.round(analysis.duration) : null,
              tempo: analysis.tempo
            });
            console.log(`Analyzed song ${songId}: tempo=${analysis.tempo}, duration=${analysis.duration}`);
          }
        } catch (analysisError) {
          console.error(`Failed to analyze song ${songId}:`, analysisError);
        }

        trackNumber++;
      }
    }

    await searchEngine.indexAlbum(albumId);

    res.redirect(`/admin/albums/edit/${albumId}`);
  } catch (error) {
    console.error('Error updating album:', error);
    res.status(500).render('error', { message: 'Error updating album' });
  }
});

app.post('/admin/albums/delete/:id', requireAuth, async (req, res) => {
  try {
    await database.deleteAlbum(parseInt(req.params.id));
    res.redirect('/admin/albums');
  } catch (error) {
    res.status(500).render('error', { message: 'Error deleting album' });
  }
});

// Album reorder API
app.post('/api/admin/albums/reorder', requireAuth, async (req: any, res) => {
  try {
    const { albumOrders } = req.body;
    if (!albumOrders || !Array.isArray(albumOrders)) {
      return res.status(400).json({ error: 'Invalid album order data' });
    }
    await database.updateAlbumOrder(albumOrders);
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering albums:', error);
    res.status(500).json({ error: 'Error reordering albums' });
  }
});

// Song delete route (for songs within albums)
app.post('/admin/songs/delete/:id', requireAuth, async (req: any, res) => {
  try {
    const song = await database.getSongById(parseInt(req.params.id));
    if (song) {
      await database.deleteSong(parseInt(req.params.id));
      if (song.album_id) {
        res.redirect(`/admin/albums/edit/${song.album_id}`);
      } else {
        res.redirect('/admin/singles');
      }
    } else {
      res.redirect('/admin/albums');
    }
  } catch (error) {
    console.error('Error deleting song:', error);
    res.status(500).render('error', { message: 'Error deleting song' });
  }
});

// Delete all tracks from an album
app.post('/admin/albums/:id/delete-all-tracks', requireAuth, async (req: any, res) => {
  try {
    const albumId = parseInt(req.params.id);
    const songs = await database.getSongsByAlbumId(albumId);

    // Delete all songs from this album
    for (const song of songs) {
      await database.deleteSong(song.id);
    }

    console.log(`Deleted ${songs.length} tracks from album ${albumId}`);
    res.redirect(`/admin/albums/edit/${albumId}`);
  } catch (error) {
    console.error('Error deleting all tracks:', error);
    res.status(500).render('error', { message: 'Error deleting tracks' });
  }
});

// Helper function to safely analyze audio using spawn (prevents command injection)
function analyzeAudioFile(filePath: string, scriptPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath, filePath], {
      timeout: 60000
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result);
        } catch (e) {
          reject(new Error('Invalid JSON response from analyzer'));
        }
      } else {
        reject(new Error(stderr || `Process exited with code ${code}`));
      }
    });

    proc.on('error', (err: Error) => {
      reject(err);
    });
  });
}

// Audio analysis API endpoint
app.post('/api/admin/songs/analyze/:id', requireAuth, async (req: any, res) => {
  try {
    const songId = parseInt(req.params.id);
    const song = await database.getSongById(songId);

    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const scriptPath = path.join(rootDir, 'scripts', 'analyze_audio.py');
    let filePath: string;
    let tempFile: string | null = null;

    // Check if file is in Object Storage
    if (song.file_path.startsWith('/objects/')) {
      try {
        tempFile = await objectStorageService.downloadToTempFile(song.file_path);
        filePath = tempFile;
      } catch (downloadError) {
        return res.status(400).json({ error: 'Could not download audio file from storage' });
      }
    } else {
      // Legacy local file path
      const allowedMusicDir = path.resolve(rootDir, 'uploads', 'music_files');
      const allowedPublicUploads = path.resolve(rootDir, 'public', 'uploads');
      const safeFileName = path.basename(song.file_path);

      if (song.file_path.startsWith('/uploads/music_files/')) {
        filePath = path.resolve(rootDir, 'public', song.file_path);
      } else {
        filePath = path.resolve(allowedMusicDir, safeFileName);
      }

      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(allowedMusicDir) && !resolvedPath.startsWith(allowedPublicUploads)) {
        console.error('Path traversal attempt blocked:', song.file_path, '->', resolvedPath);
        return res.status(400).json({ error: 'Invalid file path' });
      }
    }

    try {
      const analysis = await analyzeAudioFile(filePath, scriptPath);

      // Clean up temp file if created
      if (tempFile) {
        const fs = await import('fs');
        await fs.promises.unlink(tempFile).catch(() => { });
      }

      if (analysis.tempo || analysis.duration) {
        await database.updateSong(songId, {
          duration: analysis.duration ? Math.round(analysis.duration) : song.duration,
          tempo: analysis.tempo
        });

        res.json({
          success: true,
          tempo: analysis.tempo,
          duration: analysis.duration,
          message: 'Audio analyzed successfully'
        });
      } else {
        res.json({
          success: false,
          error: analysis.error || 'Could not analyze audio'
        });
      }
    } catch (execError: any) {
      // Clean up temp file on error
      if (tempFile) {
        const fs = await import('fs');
        await fs.promises.unlink(tempFile).catch(() => { });
      }
      console.error('Audio analysis error:', execError.message);
      res.status(500).json({ error: 'Audio analysis failed: ' + execError.message });
    }
  } catch (error) {
    console.error('Analyze song error:', error);
    res.status(500).json({ error: 'Error analyzing song' });
  }
});

// Analyze all songs endpoint (with API key or session auth)
app.post('/api/admin/songs/analyze-all', async (req: any, res, next) => {
  // Allow API key authentication for scripts
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.ADMIN_API_KEY) {
    return next();
  }
  // Fall back to session auth
  requireAuth(req, res, next);
}, async (req: any, res) => {
  try {
    // Get both album songs AND singles for analysis
    const albumSongs = await database.getAllSongs();
    const singles = await database.getAllSingles();
    const songs = [...albumSongs, ...singles];
    const results: any[] = [];
    const scriptPath = path.join(rootDir, 'scripts', 'analyze_audio.py');
    const allowedMusicDir = path.resolve(rootDir, 'uploads', 'music_files');
    const allowedPublicUploads = path.resolve(rootDir, 'public', 'uploads');

    for (const song of songs) {
      let tempFile: string | null = null;
      try {
        // Skip songs that already have duration and tempo
        if (song.duration && song.tempo) {
          results.push({ id: song.id, title: song.title, success: true, skipped: true });
          continue;
        }

        let filePath: string;

        // Check if file is in Object Storage
        if (song.file_path.startsWith('/objects/')) {
          try {
            tempFile = await objectStorageService.downloadToTempFile(song.file_path);
            filePath = tempFile;
          } catch (downloadError) {
            results.push({ id: song.id, title: song.title, error: 'Could not download from storage', success: false });
            continue;
          }
        } else {
          // Legacy local file path
          const safeFileName = path.basename(song.file_path);

          if (song.file_path.startsWith('/uploads/music_files/')) {
            filePath = path.resolve(rootDir, 'public', song.file_path);
          } else {
            filePath = path.resolve(allowedMusicDir, safeFileName);
          }

          const resolvedPath = path.resolve(filePath);
          if (!resolvedPath.startsWith(allowedMusicDir) && !resolvedPath.startsWith(allowedPublicUploads)) {
            results.push({ id: song.id, title: song.title, error: 'Invalid file path', success: false });
            continue;
          }
        }

        const analysis = await analyzeAudioFile(filePath, scriptPath);

        // Clean up temp file if created
        if (tempFile) {
          const fs = await import('fs');
          await fs.promises.unlink(tempFile).catch(() => { });
          tempFile = null;
        }

        if (analysis.tempo || analysis.duration) {
          await database.updateSong(song.id, {
            duration: analysis.duration ? Math.round(analysis.duration) : song.duration,
            tempo: analysis.tempo
          });
          results.push({ id: song.id, title: song.title, ...analysis, success: true });
        } else {
          results.push({ id: song.id, title: song.title, error: analysis.error, success: false });
        }
      } catch (execError: any) {
        // Clean up temp file on error
        if (tempFile) {
          const fs = await import('fs');
          await fs.promises.unlink(tempFile).catch(() => { });
        }
        results.push({ id: song.id, title: song.title, error: execError.message, success: false });
      }
    }

    res.json({
      success: true,
      analyzed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  } catch (error) {
    console.error('Analyze all songs error:', error);
    res.status(500).json({ error: 'Error analyzing songs' });
  }
});

// Singles routes
app.get('/admin/singles', requireAuth, async (req: any, res) => {
  const singles = await database.getAllSingles();
  const user = await pgDatabase.getUserById(req.session.userId);
  res.render('admin/singles', { singles, user });
});

app.get('/admin/singles/new', requireAuth, async (req: any, res) => {
  // Check plan-based upload limits
  const uploadCheck = await pgDatabase.canUserUpload(req.session.userId);
  if (!uploadCheck.allowed) {
    return res.render('error', {
      message: 'Uploading is not available for visitor accounts.'
    });
  }
  const user = await pgDatabase.getUserById(req.session.userId);
  res.render('admin/single-form', { single: null, edit: false, user });
});

app.get('/admin/singles/edit/:id', requireAuth, async (req: any, res) => {
  const single = await database.getSongById(parseInt(req.params.id));
  const user = await pgDatabase.getUserById(req.session.userId);
  if (single && single.album_id === null) {
    res.render('admin/single-form', { single, edit: true, user });
  } else {
    res.redirect('/admin/singles');
  }
});

app.post('/admin/singles', requireAuth, upload.fields([
  { name: 'coverArt', maxCount: 1 },
  { name: 'audioFile', maxCount: 1 }
]), async (req: any, res) => {
  try {
    // Check plan-based upload limits
    const uploadCheck = await pgDatabase.canUserUpload(req.session.userId);
    if (!uploadCheck.allowed) {
      return res.status(400).render('error', {
        message: 'Uploading is not available for visitor accounts.'
      });
    }

    const { title, price } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files['audioFile'] || files['audioFile'].length === 0) {
      return res.status(400).render('error', { message: 'Audio file is required' });
    }

    const audioFile = files['audioFile'][0];
    const tempFilePath = audioFile.path;

    // Upload audio to Object Storage
    let objectPath: string;
    try {
      objectPath = await uploadAudioToObjectStorage(tempFilePath, audioFile.originalname, audioFile.mimetype || 'audio/mpeg');
      console.log(`Uploaded single ${audioFile.originalname} to Object Storage: ${objectPath}`);
    } catch (uploadError) {
      console.error(`Failed to upload single to Object Storage:`, uploadError);
      return res.status(500).render('error', { message: 'Error uploading audio file' });
    }

    const songData: any = {
      title,
      price: price || 0.99,
      file_path: objectPath // Store Object Storage path
    };

    if (files['coverArt']) {
      songData.cover_art = files['coverArt'][0].filename;
    }

    const songId = await database.createSingle(songData);

    // Auto-analyze audio for tempo and duration
    try {
      const scriptPath = path.join(rootDir, 'scripts', 'analyze_audio.py');
      const tempFile = await objectStorageService.downloadToTempFile(objectPath);
      const analysis = await analyzeAudioFile(tempFile, scriptPath);
      // Clean up temp file
      const fs = await import('fs');
      await fs.promises.unlink(tempFile).catch(() => { });

      if (analysis.tempo || analysis.duration) {
        await database.updateSong(songId, {
          duration: analysis.duration ? Math.round(analysis.duration) : null,
          tempo: analysis.tempo
        });
        console.log(`Analyzed single ${songId}: tempo=${analysis.tempo}, duration=${analysis.duration}`);
      }
    } catch (analysisError) {
      console.error(`Failed to analyze single ${songId}:`, analysisError);
    }

    res.redirect('/admin/singles');
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { message: 'Error creating single' });
  }
});

app.post('/admin/singles/update/:id', requireAuth, upload.fields([
  { name: 'coverArt', maxCount: 1 },
  { name: 'audioFile', maxCount: 1 }
]), async (req: any, res) => {
  try {
    const { title, price } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const songData: any = {
      title,
      price: price || 0.99
    };

    let objectPath: string | undefined;
    if (files['audioFile']) {
      const audioFile = files['audioFile'][0];
      const tempFilePath = audioFile.path;

      // Upload audio to Object Storage
      try {
        objectPath = await uploadAudioToObjectStorage(tempFilePath, audioFile.originalname, audioFile.mimetype || 'audio/mpeg');
        songData.file_path = objectPath;
        console.log(`Uploaded updated single to Object Storage: ${objectPath}`);
      } catch (uploadError) {
        console.error(`Failed to upload single to Object Storage:`, uploadError);
        return res.status(500).render('error', { message: 'Error uploading audio file' });
      }
    }
    if (files['coverArt']) {
      songData.cover_art = files['coverArt'][0].filename;
    }

    await database.updateSingle(parseInt(req.params.id), songData);

    // Auto-analyze if new audio file was uploaded
    if (objectPath) {
      try {
        const scriptPath = path.join(rootDir, 'scripts', 'analyze_audio.py');
        const tempFile = await objectStorageService.downloadToTempFile(objectPath);
        const analysis = await analyzeAudioFile(tempFile, scriptPath);
        // Clean up temp file
        const fs = await import('fs');
        await fs.promises.unlink(tempFile).catch(() => { });

        if (analysis.tempo || analysis.duration) {
          await database.updateSong(parseInt(req.params.id), {
            duration: analysis.duration ? Math.round(analysis.duration) : null,
            tempo: analysis.tempo
          });
          console.log(`Analyzed updated single ${req.params.id}: tempo=${analysis.tempo}, duration=${analysis.duration}`);
        }
      } catch (analysisError) {
        console.error(`Failed to analyze updated single:`, analysisError);
      }
    }

    res.redirect('/admin/singles');
  } catch (error) {
    res.status(500).render('error', { message: 'Error updating single' });
  }
});

app.post('/admin/singles/delete/:id', requireAuth, async (req, res) => {
  try {
    await database.deleteSingle(parseInt(req.params.id));
    res.redirect('/admin/singles');
  } catch (error) {
    res.status(500).render('error', { message: 'Error deleting single' });
  }
});

// Singles reorder API
app.post('/api/admin/singles/reorder', requireAuth, async (req: any, res) => {
  try {
    const { singleOrders } = req.body;
    if (!singleOrders || !Array.isArray(singleOrders)) {
      return res.status(400).json({ error: 'Invalid single order data' });
    }
    await database.updateSingleOrder(singleOrders);
    res.json({ success: true });
  } catch (error) {
    console.error('Error reordering singles:', error);
    res.status(500).json({ error: 'Error reordering singles' });
  }
});

// Payment processing with Stripe
function validateEmail(email: string) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// Create Stripe checkout session for album purchase
app.post('/purchase/album/:id', async (req, res) => {
  try {
    const album = await database.getAlbumById(parseInt(req.params.id));
    const { email, name } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    if (!album) {
      return res.status(404).json({ success: false, message: 'Album not found' });
    }

    // Calculate discount based on purchase history
    const userPurchases = await database.getUserPurchaseCount(email);
    const discount = userPurchases >= 4 ? 0.10 : 0;
    const finalPrice = Math.round(album.price * (1 - discount) * 100); // Convert to cents

    try {
      const stripe = await getUncachableStripeClient();
      const baseUrl = getPublicBaseUrl(req);

      // Create Stripe Checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: album.title,
              description: album.description || `Album by MELORI MUSIC`,
              images: album.album_art ? [`${baseUrl}/uploads/album_art/${album.album_art}`] : [],
            },
            unit_amount: finalPrice,
          },
          quantity: 1,
        }],
        mode: 'payment',
        invoice_creation: { enabled: false },
        success_url: `${baseUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}&type=album&id=${album.id}`,
        cancel_url: `${baseUrl}/album/${album.id}`,
        customer_email: email,
        metadata: {
          type: 'album',
          album_id: String(album.id),
          customer_name: name,
          discount_percent: String(discount * 100)
        }
      });

      res.json({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id
      });
    } catch (stripeError: any) {
      console.error('Stripe error:', stripeError);
      res.status(500).json({ success: false, message: 'Payment processing unavailable' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Purchase failed' });
  }
});

// Create Stripe checkout session for song purchase
app.post('/purchase/song/:id', async (req, res) => {
  try {
    const song = await database.getSongById(parseInt(req.params.id));
    const { email, name } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    if (!song) {
      return res.status(404).json({ success: false, message: 'Song not found' });
    }

    const priceInCents = Math.round(song.price * 100);

    try {
      const stripe = await getUncachableStripeClient();
      const baseUrl = getPublicBaseUrl(req);

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: song.title,
              description: `Single track from MELORI MUSIC`,
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        }],
        mode: 'payment',
        invoice_creation: { enabled: false },
        success_url: `${baseUrl}/purchase/success?session_id={CHECKOUT_SESSION_ID}&type=song&id=${song.id}`,
        cancel_url: `${baseUrl}/music`,
        customer_email: email,
        metadata: {
          type: 'song',
          song_id: String(song.id),
          customer_name: name
        }
      });

      res.json({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id
      });
    } catch (stripeError: any) {
      console.error('Stripe error:', stripeError);
      res.status(500).json({ success: false, message: 'Payment processing unavailable' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Purchase failed' });
  }
});

// Purchase success page
app.get('/purchase/success', async (req, res) => {
  try {
    const { session_id, type, id } = req.query;

    if (!session_id) {
      return res.redirect('/');
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id as string);

    if (session.payment_status === 'paid') {
      const metadata = session.metadata || {};
      const grossAmount = (session.amount_total || 0) / 100;

      if (type === 'album') {
        const albumWithStorefront = await pgDatabase.getAlbumWithStorefront(parseInt(id as string));
        const album = albumWithStorefront || await database.getAlbumById(parseInt(id as string));
        const storefrontId = albumWithStorefront?.storefront_id || null;

        const saleId = await pgDatabase.createSale({
          storefront_id: storefrontId,
          album_id: parseInt(id as string),
          song_id: null,
          customer_email: session.customer_email || '',
          customer_name: metadata.customer_name || '',
          amount: grossAmount,
          type: 'album',
          discount: parseFloat(metadata.discount_percent || '0'),
          stripe_payment_intent_id: session.payment_intent as string
        });

        if (storefrontId) {
          const ownerPlan = await pgDatabase.getStorefrontOwnerPlan(storefrontId);
          const planName = ownerPlan?.name || 'creator';
          const commissionRate = planName.toLowerCase() === 'label' ? 0.03 :
            planName.toLowerCase() === 'pro' ? 0.05 : 0.12;
          const commissionAmount = parseFloat((grossAmount * commissionRate).toFixed(2));
          const netAmount = parseFloat((grossAmount - commissionAmount).toFixed(2));

          let stripeTransferId: string | null = null;
          let payoutStatus = 'pending';

          if (ownerPlan?.stripe_connect_account_id && netAmount > 0) {
            try {
              const transfer = await stripe.transfers.create({
                amount: Math.round(netAmount * 100),
                currency: 'usd',
                destination: ownerPlan.stripe_connect_account_id,
                transfer_group: `sale_${saleId}`,
                metadata: {
                  sale_id: String(saleId),
                  storefront_id: String(storefrontId),
                  type: 'album',
                  album_id: String(id),
                  gross_amount: String(grossAmount),
                  commission_amount: String(commissionAmount)
                }
              });

              stripeTransferId = transfer.id;
              payoutStatus = 'scheduled';
              console.log(`Transfer created: ${transfer.id} for $${netAmount} to ${ownerPlan.stripe_connect_account_id}`);
            } catch (transferError: any) {
              console.error(`Transfer failed for sale ${saleId}:`, transferError.message);
            }
          }

          await pgDatabase.createTransaction({
            sale_id: saleId,
            storefront_id: storefrontId,
            gross_amount: grossAmount,
            commission_amount: commissionAmount,
            net_amount: netAmount,
            commission_rate: commissionRate,
            stripe_transfer_id: stripeTransferId,
            payout_status: payoutStatus
          });

          console.log(`Sale recorded: Album ${album?.title} - Gross: $${grossAmount}, Commission: $${commissionAmount}, Net: $${netAmount}`);
        }

        // Send confirmation email with download link via Gmail API
        const baseUrl = getPublicBaseUrl(req);
        const downloadUrl = `${baseUrl}/download/${saleId}`;
        console.log(`Purchase success - Sale ID: ${saleId}, Download URL: ${downloadUrl}, Customer: ${session.customer_email}`);

        try {
          await sendPurchaseConfirmationEmail({
            customerEmail: session.customer_email || '',
            itemTitle: album?.title || 'Unknown Album',
            itemType: 'album',
            downloadUrl: downloadUrl
          });
        } catch (emailError) {
          console.error('Failed to send purchase email:', emailError);
        }

        // Send sale notification to admin
        try {
          await sendSaleNotificationEmail({
            customerEmail: session.customer_email || '',
            customerName: metadata.customer_name,
            itemTitle: album?.title || 'Unknown Album',
            itemType: 'album',
            amount: grossAmount,
            saleId: saleId,
            stripePaymentIntentId: session.payment_intent as string
          });
        } catch (adminEmailError) {
          console.error('Failed to send admin sale notification:', adminEmailError);
        }

        res.render('purchase-success', {
          item: album,
          type: 'album',
          email: session.customer_email,
          saleId: saleId
        });
      } else {
        const songWithStorefront = await pgDatabase.getSongWithStorefront(parseInt(id as string));
        const song = songWithStorefront || await database.getSongById(parseInt(id as string));
        const storefrontId = songWithStorefront?.effective_storefront_id || null;

        const saleId = await pgDatabase.createSale({
          storefront_id: storefrontId,
          album_id: null,
          song_id: parseInt(id as string),
          customer_email: session.customer_email || '',
          customer_name: metadata.customer_name || '',
          amount: grossAmount,
          type: 'song',
          discount: 0,
          stripe_payment_intent_id: session.payment_intent as string
        });

        if (storefrontId) {
          const ownerPlan = await pgDatabase.getStorefrontOwnerPlan(storefrontId);
          const planName = ownerPlan?.name || 'creator';
          const commissionRate = planName.toLowerCase() === 'label' ? 0.03 :
            planName.toLowerCase() === 'pro' ? 0.05 : 0.12;
          const commissionAmount = parseFloat((grossAmount * commissionRate).toFixed(2));
          const netAmount = parseFloat((grossAmount - commissionAmount).toFixed(2));

          let stripeTransferId: string | null = null;
          let payoutStatus = 'pending';

          if (ownerPlan?.stripe_connect_account_id && netAmount > 0) {
            try {
              const transfer = await stripe.transfers.create({
                amount: Math.round(netAmount * 100),
                currency: 'usd',
                destination: ownerPlan.stripe_connect_account_id,
                transfer_group: `sale_${saleId}`,
                metadata: {
                  sale_id: String(saleId),
                  storefront_id: String(storefrontId),
                  type: 'song',
                  song_id: String(id),
                  gross_amount: String(grossAmount),
                  commission_amount: String(commissionAmount)
                }
              });

              stripeTransferId = transfer.id;
              payoutStatus = 'scheduled';
              console.log(`Transfer created: ${transfer.id} for $${netAmount} to ${ownerPlan.stripe_connect_account_id}`);
            } catch (transferError: any) {
              console.error(`Transfer failed for sale ${saleId}:`, transferError.message);
            }
          }

          await pgDatabase.createTransaction({
            sale_id: saleId,
            storefront_id: storefrontId,
            gross_amount: grossAmount,
            commission_amount: commissionAmount,
            net_amount: netAmount,
            commission_rate: commissionRate,
            stripe_transfer_id: stripeTransferId,
            payout_status: payoutStatus
          });

          console.log(`Sale recorded: Song ${song?.title} - Gross: $${grossAmount}, Commission: $${commissionAmount}, Net: $${netAmount}`);
        }

        // Send confirmation email with download link via Gmail API
        const baseUrl = getPublicBaseUrl(req);
        const downloadUrl = `${baseUrl}/download/${saleId}`;
        console.log(`Purchase success - Sale ID: ${saleId}, Download URL: ${downloadUrl}, Customer: ${session.customer_email}`);

        try {
          await sendPurchaseConfirmationEmail({
            customerEmail: session.customer_email || '',
            itemTitle: song?.title || 'Unknown Song',
            itemType: 'song',
            downloadUrl: downloadUrl
          });
        } catch (emailError) {
          console.error('Failed to send purchase email:', emailError);
        }

        // Send sale notification to admin
        try {
          await sendSaleNotificationEmail({
            customerEmail: session.customer_email || '',
            customerName: metadata.customer_name,
            itemTitle: song?.title || 'Unknown Song',
            itemType: 'song',
            amount: grossAmount,
            saleId: saleId,
            stripePaymentIntentId: session.payment_intent as string
          });
        } catch (adminEmailError) {
          console.error('Failed to send admin sale notification:', adminEmailError);
        }

        res.render('purchase-success', {
          item: song,
          type: 'song',
          email: session.customer_email,
          saleId: saleId
        });
      }
    } else {
      res.redirect('/');
    }
  } catch (error) {
    console.error('Error processing success:', error);
    res.redirect('/');
  }
});

// =====================
// Pricing & Subscription Routes
// =====================

// Pricing page - redirect to register (visitor-only platform)
app.get('/pricing', (req: any, res) => {
  res.redirect('/register');
});

// Create subscription checkout session
app.post('/api/subscribe', requireAuth, validateCsrf, async (req: any, res) => {
  try {
    const { plan, billing } = req.body;
    const userId = req.session.userId;

    if (!plan || !['pro', 'label'].includes(plan)) {
      return res.status(400).json({ success: false, message: 'Invalid plan selected' });
    }

    const selectedPlan = await pgDatabase.getPlanByName(plan);
    if (!selectedPlan) {
      return res.status(400).json({ success: false, message: 'Plan not found' });
    }

    // Get the correct price ID based on billing period
    const priceId = billing === 'yearly'
      ? selectedPlan.stripe_price_id_yearly
      : selectedPlan.stripe_price_id_monthly;

    if (!priceId) {
      return res.status(400).json({
        success: false,
        message: 'Stripe prices not configured. Please run the seed script first.'
      });
    }

    const user = await pgDatabase.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    // Create or retrieve Stripe customer
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: String(userId),
          username: user.username
        }
      });
      customerId = customer.id;
      await pgDatabase.updateUserStripeCustomerId(userId, customerId);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${baseUrl}/api/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/api/subscription/cancel`,
      metadata: {
        user_id: String(userId),
        plan_name: plan,
        billing_period: billing
      },
      subscription_data: {
        metadata: {
          user_id: String(userId),
          plan_name: plan
        }
      }
    });

    res.json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });

  } catch (error: any) {
    console.error('Subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to create subscription' });
  }
});

// Handle successful subscription
app.get('/api/subscription/success', async (req: any, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.redirect('/pricing?error=missing_session');
    }

    // Verify user is logged in
    if (!req.session.userId) {
      console.warn('Subscription success: No logged-in user');
      return res.redirect('/login?error=session_expired');
    }

    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id as string, {
      expand: ['subscription', 'customer']
    });

    // Verify the session belongs to the logged-in user
    const metadata = session.metadata || {};
    const sessionUserId = parseInt(metadata.user_id);
    const loggedInUserId = req.session.userId;

    if (sessionUserId !== loggedInUserId) {
      console.warn(`Subscription success: User mismatch - session user ${sessionUserId} vs logged-in user ${loggedInUserId}`);
      return res.redirect('/pricing?error=unauthorized');
    }

    // Additionally verify customer email matches
    const loggedInUser = await pgDatabase.getUserById(loggedInUserId);
    if (loggedInUser && session.customer_email) {
      if (session.customer_email.toLowerCase() !== loggedInUser.email.toLowerCase()) {
        console.warn(`Subscription success: Email mismatch - session email ${session.customer_email} vs user email ${loggedInUser.email}`);
        return res.redirect('/pricing?error=unauthorized');
      }
    }

    if (session.payment_status === 'paid' || session.status === 'complete') {
      const planName = metadata.plan_name;

      if (sessionUserId && planName) {
        const plan = await pgDatabase.getPlanByName(planName);
        if (plan) {
          await pgDatabase.updateUserPlan(sessionUserId, plan.id);
          console.log(`User ${sessionUserId} upgraded to ${planName} plan (verified)`);
        }
      }

      res.redirect('/admin/dashboard?subscription=success');
    } else {
      res.redirect('/pricing?error=payment_incomplete');
    }

  } catch (error) {
    console.error('Subscription success error:', error);
    res.redirect('/pricing?error=processing_failed');
  }
});

// Handle cancelled checkout
app.get('/api/subscription/cancel', (req, res) => {
  res.redirect('/pricing?cancelled=true');
});

// Cancel active subscription
app.post('/api/subscription/cancel', requireAuth, validateCsrf, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const user = await pgDatabase.getUserById(userId);

    if (!user || !user.stripe_customer_id) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    const stripe = await getUncachableStripeClient();

    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripe_customer_id,
      status: 'active'
    });

    if (subscriptions.data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No active subscription found'
      });
    }

    // Cancel the subscription at period end
    for (const subscription of subscriptions.data) {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true
      });
    }

    res.json({
      success: true,
      message: 'Subscription will be cancelled at the end of the billing period'
    });

  } catch (error: any) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
});

// Check plan limits API
app.get('/api/plan/limits', requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const [uploadCheck, storefrontCheck] = await Promise.all([
      pgDatabase.canUserUpload(userId),
      pgDatabase.canUserCreateStorefront(userId)
    ]);

    res.json({
      uploads: uploadCheck,
      storefronts: storefrontCheck
    });
  } catch (error) {
    console.error('Plan limits error:', error);
    res.status(500).json({ error: 'Failed to check plan limits' });
  }
});

// =====================
// Stripe Connect Routes (Artist Bank Account Setup)
// =====================

// Start Stripe Connect onboarding
app.get('/artist/connect/onboard', requireArtist, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const user = await pgDatabase.getUserById(userId);

    if (!user) {
      return res.redirect('/login');
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    let connectAccountId = user.stripe_connect_account_id;

    // Create Express account if not exists
    if (!connectAccountId) {
      console.log(`Creating Stripe Connect Express account for user ${userId}`);

      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user.email,
        capabilities: {
          transfers: { requested: true }
        },
        metadata: {
          user_id: String(userId),
          username: user.username
        }
      });

      connectAccountId = account.id;

      // Store the Connect account ID
      await pgDatabase.updateUser(userId, {
        stripe_connect_account_id: connectAccountId
      });

      console.log(`Created Connect account ${connectAccountId} for user ${userId}`);
    }

    // Generate account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: connectAccountId,
      refresh_url: `${baseUrl}/artist/connect/refresh`,
      return_url: `${baseUrl}/artist/connect/return`,
      type: 'account_onboarding'
    });

    console.log(`Redirecting user ${userId} to Stripe Connect onboarding`);
    res.redirect(accountLink.url);

  } catch (error: any) {
    console.error('Stripe Connect onboarding error:', {
      message: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      raw: error.raw?.message
    });

    // Check if Stripe Connect is not enabled on the account
    if (error.message?.includes("signed up for Connect") ||
      error.raw?.message?.includes("signed up for Connect")) {
      return res.redirect('/admin/bank?error=connect_not_enabled');
    }

    res.redirect('/admin/bank?error=setup_failed');
  }
});

// Handle return from Stripe Connect onboarding
app.get('/artist/connect/return', requireArtist, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const user = await pgDatabase.getUserById(userId);

    if (!user || !user.stripe_connect_account_id) {
      console.error('Connect return: No Connect account found for user', userId);
      return res.redirect('/admin/bank?error=no_account');
    }

    const stripe = await getUncachableStripeClient();

    // Retrieve the account to check status
    const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);

    console.log(`Connect return for user ${userId}:`, {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted
    });

    // Check if onboarding is complete
    if (account.details_submitted) {
      await pgDatabase.updateUser(userId, {
        onboarding_complete: true
      });

      console.log(`User ${userId} completed Stripe Connect onboarding`);
      res.redirect('/admin/bank?success=connected');
    } else {
      // Onboarding not complete, may need to return
      console.log(`User ${userId} returned but onboarding not complete`);
      res.redirect('/admin/bank?pending=true');
    }

  } catch (error: any) {
    console.error('Stripe Connect return error:', error);
    res.redirect('/admin/bank?error=verification_failed');
  }
});

// Handle refresh link for incomplete onboarding
app.get('/artist/connect/refresh', requireArtist, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const user = await pgDatabase.getUserById(userId);

    if (!user || !user.stripe_connect_account_id) {
      return res.redirect('/artist/connect/onboard');
    }

    const stripe = await getUncachableStripeClient();
    const baseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;

    // Generate a new account link
    const accountLink = await stripe.accountLinks.create({
      account: user.stripe_connect_account_id,
      refresh_url: `${baseUrl}/artist/connect/refresh`,
      return_url: `${baseUrl}/artist/connect/return`,
      type: 'account_onboarding'
    });

    console.log(`Refreshing Connect onboarding for user ${userId}`);
    res.redirect(accountLink.url);

  } catch (error: any) {
    console.error('Stripe Connect refresh error:', error);
    res.render('error', {
      message: 'Unable to resume bank account setup. Please try again later.'
    });
  }
});

// Check Connect account status API
app.get('/api/artist/connect/status', requireArtist, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const user = await pgDatabase.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // No Connect account yet
    if (!user.stripe_connect_account_id) {
      return res.json({
        connected: false,
        onboarding_complete: false,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        message: 'No bank account connected. Complete setup to receive payouts.'
      });
    }

    const stripe = await getUncachableStripeClient();

    try {
      const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);

      // Update onboarding_complete if details are now submitted
      if (account.details_submitted && !user.onboarding_complete) {
        await pgDatabase.updateUser(userId, {
          onboarding_complete: true
        });
      }

      res.json({
        connected: true,
        onboarding_complete: account.details_submitted || false,
        charges_enabled: account.charges_enabled || false,
        payouts_enabled: account.payouts_enabled || false,
        details_submitted: account.details_submitted || false,
        message: account.details_submitted
          ? 'Bank account connected and verified.'
          : 'Bank account setup incomplete. Please complete the verification process.'
      });

    } catch (stripeError: any) {
      console.error('Error retrieving Connect account:', stripeError);
      res.json({
        connected: false,
        onboarding_complete: false,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
        message: 'Error checking account status. Please try again.',
        error: stripeError.message
      });
    }

  } catch (error: any) {
    console.error('Connect status error:', error);
    res.status(500).json({ error: 'Failed to check Connect status' });
  }
});

// Create Stripe Connect login link (for existing connected accounts)
app.get('/artist/connect/dashboard', requireArtist, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const user = await pgDatabase.getUserById(userId);

    if (!user || !user.stripe_connect_account_id) {
      return res.redirect('/artist/connect/onboard');
    }

    const stripe = await getUncachableStripeClient();

    // Create a login link to the Express dashboard
    const loginLink = await stripe.accounts.createLoginLink(
      user.stripe_connect_account_id
    );

    res.redirect(loginLink.url);

  } catch (error: any) {
    console.error('Connect dashboard error:', error);
    res.render('error', {
      message: 'Unable to access Stripe dashboard. Please try again later.'
    });
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

// Bank Info Management
app.get('/admin/bank', requireArtist, async (req: any, res) => {
  try {
    const user = await pgDatabase.getUserById(req.session.userId);

    // Get Stripe Connect status if user has a connect account
    let connectStatus = null;
    if (user && user.stripe_connect_account_id) {
      try {
        const stripe = await getUncachableStripeClient();
        const account = await stripe.accounts.retrieve(user.stripe_connect_account_id);
        connectStatus = {
          connected: true,
          details_submitted: account.details_submitted || false,
          charges_enabled: account.charges_enabled || false,
          payouts_enabled: account.payouts_enabled || false
        };
      } catch (stripeError) {
        console.error('Error fetching Connect account:', stripeError);
        connectStatus = { connected: false, error: true };
      }
    }

    // Check for query params for success/error messages
    const success = req.query.success;
    const error = req.query.error;
    const pending = req.query.pending;

    res.render('admin/bank', {
      user,
      connectStatus,
      success,
      error,
      pending
    });
  } catch (error) {
    console.error('Bank page error:', error);
    res.status(500).render('error', { message: 'Error loading bank info' });
  }
});

app.post('/admin/bank', requireAuth, validateCsrf, async (req: any, res) => {
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

// Storefront Management Routes
app.get('/admin/storefront', requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const storefronts = await pgDatabase.getStorefrontsByUserId(userId);
    const canCreate = await pgDatabase.canUserCreateStorefront(userId);
    const user = await pgDatabase.getUserWithPlan(userId);
    const plan = user ? await pgDatabase.getPlanById(user.plan_id) : null;

    // Get stats for each storefront
    for (const storefront of storefronts) {
      storefront.stats = await pgDatabase.getStorefrontStats(storefront.id);
    }

    const baseUrl = getPublicBaseUrl();

    res.render('admin/storefront', {
      storefronts,
      canCreate,
      plan,
      baseUrl,
      success: req.query.success,
      error: req.query.error
    });
  } catch (error) {
    console.error('Storefront list error:', error);
    res.status(500).render('error', { message: 'Error loading storefronts' });
  }
});

app.get('/admin/storefront/new', requireAuth, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const canCreate = await pgDatabase.canUserCreateStorefront(userId);

    if (!canCreate.allowed) {
      return res.redirect('/admin/storefront?error=' + encodeURIComponent(canCreate.reason));
    }

    const baseUrl = getPublicBaseUrl();

    res.render('admin/storefront-form', {
      edit: false,
      storefront: null,
      baseUrl,
      error: null
    });
  } catch (error) {
    console.error('New storefront form error:', error);
    res.status(500).render('error', { message: 'Error loading form' });
  }
});

app.post('/admin/storefront/create', requireAuth, validateCsrf, storefrontUpload, async (req: any, res) => {
  try {
    const userId = req.session.userId;
    const canCreate = await pgDatabase.canUserCreateStorefront(userId);

    if (!canCreate.allowed) {
      return res.redirect('/admin/storefront?error=' + encodeURIComponent(canCreate.reason));
    }

    const { name, slug, description, primaryColor } = req.body;
    const baseUrl = getPublicBaseUrl();

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slug || !slugRegex.test(slug)) {
      return res.render('admin/storefront-form', {
        edit: false,
        storefront: { name, slug, description, primary_color: primaryColor },
        baseUrl,
        error: 'Slug must contain only lowercase letters, numbers, and hyphens'
      });
    }

    // Check slug uniqueness
    const slugExists = await pgDatabase.checkSlugExists(slug);
    if (slugExists) {
      return res.render('admin/storefront-form', {
        edit: false,
        storefront: { name, slug, description, primary_color: primaryColor },
        baseUrl,
        error: 'This URL slug is already taken. Please choose another.'
      });
    }

    // Get uploaded files
    const files = req.files || {};
    const logoFile = files.logo?.[0];
    const bannerFile = files.banner?.[0];

    const storefrontId = await pgDatabase.createStorefront({
      owner_user_id: userId,
      name,
      slug,
      description,
      logo_url: logoFile?.filename || null,
      banner_url: bannerFile?.filename || null,
      primary_color: primaryColor || '#FF5500'
    });

    res.redirect('/admin/storefront?success=' + encodeURIComponent('Storefront created successfully!'));
  } catch (error) {
    console.error('Create storefront error:', error);
    const baseUrl = getPublicBaseUrl();
    res.render('admin/storefront-form', {
      edit: false,
      storefront: req.body,
      baseUrl,
      error: 'Error creating storefront. Please try again.'
    });
  }
});

app.get('/admin/storefront/:id/edit', requireAuth, async (req: any, res) => {
  try {
    const storefrontId = parseInt(req.params.id);
    const userId = req.session.userId;

    const storefront = await pgDatabase.getStorefrontById(storefrontId);

    if (!storefront) {
      return res.status(404).render('404');
    }

    // Check ownership
    if (storefront.owner_user_id !== userId) {
      return res.status(403).render('error', { message: 'You do not have permission to edit this storefront.' });
    }

    const baseUrl = getPublicBaseUrl();

    res.render('admin/storefront-form', {
      edit: true,
      storefront,
      baseUrl,
      error: null
    });
  } catch (error) {
    console.error('Edit storefront form error:', error);
    res.status(500).render('error', { message: 'Error loading storefront' });
  }
});

app.post('/admin/storefront/:id/update', requireAuth, validateCsrf, storefrontUpload, async (req: any, res) => {
  try {
    const storefrontId = parseInt(req.params.id);
    const userId = req.session.userId;
    const baseUrl = getPublicBaseUrl();

    const storefront = await pgDatabase.getStorefrontById(storefrontId);

    if (!storefront) {
      return res.status(404).render('404');
    }

    // Check ownership
    if (storefront.owner_user_id !== userId) {
      return res.status(403).render('error', { message: 'You do not have permission to edit this storefront.' });
    }

    const { name, slug, description, primaryColor } = req.body;

    // Validate slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slug || !slugRegex.test(slug)) {
      return res.render('admin/storefront-form', {
        edit: true,
        storefront: { ...storefront, name, slug, description, primary_color: primaryColor },
        baseUrl,
        error: 'Slug must contain only lowercase letters, numbers, and hyphens'
      });
    }

    // Check slug uniqueness (excluding current storefront)
    const slugExists = await pgDatabase.checkSlugExists(slug, storefrontId);
    if (slugExists) {
      return res.render('admin/storefront-form', {
        edit: true,
        storefront: { ...storefront, name, slug, description, primary_color: primaryColor },
        baseUrl,
        error: 'This URL slug is already taken. Please choose another.'
      });
    }

    // Get uploaded files
    const files = req.files || {};
    const logoFile = files.logo?.[0];
    const bannerFile = files.banner?.[0];

    const updateData: any = {
      name,
      slug,
      description,
      primary_color: primaryColor || '#FF5500'
    };

    // Only update image URLs if new files were uploaded
    if (logoFile) {
      updateData.logo_url = logoFile.filename;
    }
    if (bannerFile) {
      updateData.banner_url = bannerFile.filename;
    }

    await pgDatabase.updateStorefront(storefrontId, updateData);

    res.redirect('/admin/storefront?success=' + encodeURIComponent('Storefront updated successfully!'));
  } catch (error) {
    console.error('Update storefront error:', error);
    res.status(500).render('error', { message: 'Error updating storefront' });
  }
});

app.post('/admin/storefront/:id/delete', requireAuth, validateCsrf, async (req: any, res) => {
  try {
    const storefrontId = parseInt(req.params.id);
    const userId = req.session.userId;

    const storefront = await pgDatabase.getStorefrontById(storefrontId);

    if (!storefront) {
      return res.redirect('/admin/storefront?error=' + encodeURIComponent('Storefront not found'));
    }

    // Check ownership
    if (storefront.owner_user_id !== userId) {
      return res.redirect('/admin/storefront?error=' + encodeURIComponent('You do not have permission to delete this storefront.'));
    }

    await pgDatabase.softDeleteStorefront(storefrontId);

    res.redirect('/admin/storefront?success=' + encodeURIComponent('Storefront deleted successfully'));
  } catch (error) {
    console.error('Delete storefront error:', error);
    res.redirect('/admin/storefront?error=' + encodeURIComponent('Error deleting storefront'));
  }
});

// Public Storefront Route
app.get('/store/:slug', async (req, res) => {
  try {
    const storefront = await pgDatabase.getStorefrontWithOwner(req.params.slug);

    if (!storefront) {
      return res.status(404).render('404');
    }

    const { albums, singles } = await pgDatabase.getStorefrontAlbumsAndSingles(storefront.id);

    res.render('store', {
      storefront,
      albums,
      singles
    });
  } catch (error) {
    console.error('Public storefront error:', error);
    res.status(500).render('error', { message: 'Error loading storefront' });
  }
});

// Admin Feedback Management
app.get('/admin/feedback', requireAuth, async (req: any, res) => {
  try {
    const feedback = await pgDatabase.getAllFeedback();
    const stats = await pgDatabase.getFeedbackStats();
    res.render('admin/feedback', {
      user: await pgDatabase.getUserById(req.session.userId),
      feedback,
      stats
    });
  } catch (error) {
    console.error('Error loading feedback:', error);
    res.status(500).render('error', { message: 'Error loading feedback' });
  }
});

app.post('/admin/feedback/:id/review', requireAuth, async (req: any, res) => {
  try {
    await pgDatabase.updateFeedbackStatus(parseInt(req.params.id), 'reviewed');
    res.redirect('/admin/feedback');
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.redirect('/admin/feedback');
  }
});

app.post('/admin/feedback/:id/delete', requireAuth, async (req: any, res) => {
  try {
    await pgDatabase.deleteFeedback(parseInt(req.params.id));
    res.redirect('/admin/feedback');
  } catch (error) {
    console.error('Error deleting feedback:', error);
    res.redirect('/admin/feedback');
  }
});

// Admin Analytics Page
app.get('/admin/analytics', requirePlatformAdmin, async (req: any, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const user = await pgDatabase.getUserById(req.session.userId);
    const summary = await pgDatabase.getAnalyticsSummary(days);
    const topPages = await pgDatabase.getTopPagesByViews(days, 20);
    const userEngagement = await pgDatabase.getUserEngagement(days, 50);

    res.render('admin/analytics', {
      user,
      summary,
      topPages,
      userEngagement
    });
  } catch (error) {
    console.error('Error loading analytics:', error);
    res.status(500).render('error', { message: 'Error loading analytics' });
  }
});

// API endpoints for analytics filtering
app.get('/api/admin/analytics/top-pages', requirePlatformAdmin, async (req: any, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const topPages = await pgDatabase.getTopPagesByViews(days, 20);
    res.json(topPages);
  } catch (error) {
    console.error('Error fetching top pages:', error);
    res.status(500).json({ error: 'Failed to fetch top pages' });
  }
});

app.get('/api/admin/analytics/engagement', requirePlatformAdmin, async (req: any, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const engagement = await pgDatabase.getUserEngagement(days, 50);
    res.json(engagement);
  } catch (error) {
    console.error('Error fetching engagement:', error);
    res.status(500).json({ error: 'Failed to fetch engagement' });
  }
});

// Admin Promo Code Management
app.get('/admin/promo', requirePlatformAdmin, async (req: any, res) => {
  try {
    const user = await pgDatabase.getUserById(req.session.userId);
    const campaigns = await pgDatabase.getPromoCampaigns(true);
    const stats = await pgDatabase.getPromoStats();
    const redemptions = await pgDatabase.getPromoRedemptions(null, 50);
    const allCodes = await pgDatabase.getAllPromoCodes(500);

    // Get available code count for each campaign
    for (const campaign of campaigns) {
      campaign.codes_available = await pgDatabase.getActivePromoCodeCount(campaign.id);
    }

    res.render('admin/promo', {
      user,
      campaigns,
      stats,
      redemptions,
      allCodes
    });
  } catch (error) {
    console.error('Error loading promo codes:', error);
    res.status(500).render('error', { message: 'Error loading promo codes' });
  }
});

app.post('/admin/promo/campaigns', requirePlatformAdmin, validateCsrf, async (req: any, res) => {
  try {
    const { keyword, name, description, reward_type, max_redemptions } = req.body;

    await pgDatabase.createPromoCampaign({
      keyword: keyword.toUpperCase(),
      name,
      description,
      reward_type,
      max_redemptions: parseInt(max_redemptions) || 1000,
      created_by: req.session.userId
    });

    res.redirect('/admin/promo');
  } catch (error: any) {
    console.error('Error creating campaign:', error);
    res.redirect('/admin/promo?error=' + encodeURIComponent(error.message || 'Failed to create campaign'));
  }
});

app.post('/admin/promo/codes/generate', requirePlatformAdmin, validateCsrf, async (req: any, res) => {
  try {
    const { campaign_id, count } = req.body;
    await pgDatabase.generatePromoCodes(parseInt(campaign_id), parseInt(count) || 100);
    res.redirect('/admin/promo');
  } catch (error) {
    console.error('Error generating codes:', error);
    res.redirect('/admin/promo?error=' + encodeURIComponent('Failed to generate codes'));
  }
});

// API endpoint for resending download emails
app.post('/api/admin/resend-download', async (req: any, res) => {
  try {
    const { saleId, email, albumTitle } = req.body;
    const apiKey = req.headers['x-api-key'];

    // Simple API key auth for admin operations
    if (apiKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const baseUrl = getPublicBaseUrl(req);
    const downloadUrl = `${baseUrl}/download/${saleId}`;

    await sendPurchaseConfirmationEmail({
      customerEmail: email,
      itemTitle: albumTitle || 'Your Purchase',
      itemType: 'album',
      downloadUrl: downloadUrl
    });

    res.json({ success: true, message: `Download email sent to ${email}` });
  } catch (error: any) {
    console.error('Error resending download email:', error);
    res.status(500).json({ error: error.message || 'Failed to send email' });
  }
});

// API endpoint for generating codes and returning them (for copy/export)
app.post('/api/admin/promo/generate', requirePlatformAdmin, async (req: any, res) => {
  try {
    const { campaign_id, count } = req.body;
    const campaign = await pgDatabase.getPromoCampaignById(parseInt(campaign_id));
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const codes = await pgDatabase.generatePromoCodes(parseInt(campaign_id), parseInt(count) || 100);
    const formattedCodes = codes.map((c: any) => `${campaign.keyword}-${c.code}`);

    res.json({
      success: true,
      count: codes.length,
      keyword: campaign.keyword,
      codes: formattedCodes
    });
  } catch (error) {
    console.error('Error generating codes:', error);
    res.status(500).json({ error: 'Failed to generate codes' });
  }
});

app.post('/admin/promo/campaigns/:id/deactivate', requirePlatformAdmin, validateCsrf, async (req: any, res) => {
  try {
    await pgDatabase.deactivatePromoCampaign(parseInt(req.params.id));
    res.redirect('/admin/promo');
  } catch (error) {
    console.error('Error deactivating campaign:', error);
    res.redirect('/admin/promo');
  }
});

// Account Settings
app.get('/admin/settings', requireAuth, async (req: any, res) => {
  try {
    const userId = parseInt(req.session.userId);
    const user = await pgDatabase.getUserById(userId);
    console.log('Settings GET - userId:', userId, 'user:', user);
    res.render('admin/settings', { user });
  } catch (error) {
    console.error('Settings GET error:', error);
    res.status(500).render('error', { message: 'Error loading settings' });
  }
});

app.post('/admin/settings', requireAuth, validateCsrf, async (req: any, res) => {
  try {
    const { currentPassword, username, newPassword, confirmPassword } = req.body;
    const userId = parseInt(req.session.userId);
    const user = await pgDatabase.getUserById(userId);

    console.log('Settings update - userId:', userId, 'user found:', !!user);

    // Verify current password using PostgreSQL
    const isValid = await pgDatabase.verifyUserPassword(userId, currentPassword);
    console.log('Password verification result:', isValid);

    if (!isValid) {
      return res.render('admin/settings', {
        user,
        error: 'Current password is incorrect'
      });
    }

    // Only validate password fields if user is trying to change password
    const wantsToChangePassword = newPassword && newPassword.trim().length > 0;

    if (wantsToChangePassword) {
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
    }

    // Update credentials in PostgreSQL - only update password if provided
    if (wantsToChangePassword) {
      await pgDatabase.updateUserCredentials(userId, username, newPassword);
      console.log('Updated username and password for user:', userId);
    } else {
      // Only update username, not password
      await pgDatabase.updateUser(userId, { username });
      console.log('Updated username only for user:', userId);
    }

    res.render('admin/settings', {
      user: { ...user, username },
      success: true
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).render('error', { message: 'Error updating settings' });
  }
});

// Avatar upload endpoint with CSRF validation
const avatarUpload = upload.single('avatar');
const validateCsrfForJson = (req: any, res: any, next: any) => {
  const token = req.headers['x-csrf-token'];
  const sessionToken = req.session.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    console.error('Avatar CSRF token mismatch');
    return res.status(403).json({ error: 'Invalid security token. Please refresh the page and try again.' });
  }
  next();
};

app.post('/admin/settings/avatar', requireAuth, validateCsrfForJson, (req: any, res: any, next: any) => {
  avatarUpload(req, res, function (err: any) {
    if (err) {
      console.error('Avatar upload error:', err);
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    next();
  });
}, async (req: any, res: any) => {
  try {
    const userId = parseInt(req.session.userId);

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const avatarUrl = '/uploads/avatars/' + req.file.filename;
    await pgDatabase.updateUserAvatar(userId, avatarUrl);

    res.json({ success: true, avatarUrl });
  } catch (error) {
    console.error('Avatar update error:', error);
    res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// Download endpoint
app.get('/download/:saleId', async (req, res) => {
  try {
    const sale = await database.getSaleById(parseInt(req.params.saleId));
    if (!sale) {
      return res.status(404).render('404');
    }

    if (sale.type === 'album') {
      const songs = await database.getSongsByAlbumId(sale.album_id);
      res.render('download', { sale, songs });
    } else {
      const song = await database.getSongById(sale.song_id);
      res.render('download', { sale, songs: song ? [song] : [] });
    }
  } catch (error) {
    res.status(404).render('404');
  }
});

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(500).render('error', {
    message: 'Something went wrong! Please try again later.'
  });
});

// SPA fallback - serve index.html for all non-API, non-static routes
// This allows client-side routing to work properly
app.get('*', (req, res) => {
  // Don't serve HTML for API routes or if it looks like a file request
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }

  // For production builds, serve the built index.html from dist/public
  if (process.env.NODE_ENV === 'production') {
    const indexPath = path.join(rootDir, 'dist', 'public', 'index.html');
    return res.sendFile(indexPath, (err) => {
      if (err) {
        console.error('Failed to serve index.html:', err?.message || err, 'Path:', indexPath);
        if (!res.headersSent) {
          res.status(404).send('Page Not Found');
        }
      }
    });
  }

  // Fallback to 404 page
  res.status(404).send('Page Not Found');
});

// Initialize and start server
database.initialize().then(async () => {
  await searchEngine.initialize();

  httpServer.listen(PORT, '0.0.0.0', () => {
    const baseUrl = getPublicBaseUrl();
    console.log(`Server running on port ${PORT}`);
    console.log(`Visit: ${baseUrl}`);
    if (process.env.ADMIN_PASSWORD) {
      console.log(`Admin login: admin / [ADMIN_PASSWORD from environment]`);
    } else {
      console.log(`Admin login: Check server logs for generated password or set ADMIN_PASSWORD env var`);
    }
  });
}).catch((err: Error) => {
  console.error('Database initialization failed:', err);
});
