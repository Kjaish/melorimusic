# Melori Music Platform - Deployment Guide

## Quick Start - VPS Deployment

This guide covers deploying the Melori Music Platform Node.js server to a production VPS.

### Prerequisites

- VPS with Ubuntu/Debian (2GB+ RAM recommended)
- Domain name pointed to VPS IP
- SSH access to VPS
- Node.js v20+, PM2, Nginx installed on VPS

---

## Step 1: Clone Repository

```bash
cd /home/m6  # Or your preferred directory
git clone https://github.com/YOUR_USERNAME/REPO_NAME.git melori_music
cd melori_music
```

## Step 2: Install Dependencies & Build

```bash
npm install --production
export NODE_ENV=production
npm run build
```

**Verify build:** Check that `dist/index.cjs` exists

## Step 3: Create Environment File

Create `.env` file in the project root (never commit this file!):

```bash
nano .env
```

**Required environment variables:**

```env
NODE_ENV=production
PORT=3001
PUBLIC_BASE_URL=http://melorimusicplatform.com

# Database
DATABASE_URL=sqlite:music.db

# Security
SESSION_SECRET=<Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))">
ADMIN_PASSWORD=<Your strong admin password>
ADMIN_API_KEY=melori-admin-analyze-2024

# Email (Gmail SMTP)
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-gmail-app-password
GMAIL_APP_PASSWORD=your-gmail-app-password

# File Storage
UPLOAD_DIR=public/uploads

# Optional: Stripe Integration
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_PUBLISHABLE_KEY=<your-stripe-publishable-key>

# Logging
DEBUG=false
VERBOSE_LOGGING=false
```

**Save and exit:** `Ctrl+X`, `Y`, `Enter`

## Step 4: Create Required Directories

```bash
mkdir -p logs
mkdir -p public/uploads/music_files
mkdir -p public/uploads/album_art
mkdir -p public/uploads/avatars
mkdir -p public/uploads/temp
chmod -R 755 public/uploads
```

## Step 5: Start Application with PM2

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 logs melori-node  # Check logs
```

**Enable auto-start on reboot:**
```bash
pm2 startup
# Run the command that PM2 outputs
```

## Step 6: Configure Nginx

Copy the nginx configuration:

```bash
sudo cp nginx-melori.conf /etc/nginx/sites-available/melori
sudo ln -s /etc/nginx/sites-available/melori /etc/nginx/sites-enabled/
```

**Test configuration:**
```bash
sudo nginx -t
```

**Reload Nginx:**
```bash
sudo systemctl reload nginx
```

## Step 7: Configure DNS

In your domain registrar (GoDaddy):

1. Go to DNS Management
2. Add/Update A record:
   - **Type:** A
   - **Name:** @ (for root domain)
   - **Value:** Your VPS IP (e.g., 160.153.186.249)
   - **TTL:** 600 (10 minutes)

3. Add www subdomain (optional):
   - **Type:** A
   - **Name:** www
   - **Value:** Your VPS IP
   - **TTL:** 600

**Wait 5-30 minutes for DNS propagation**

## Step 8: Set Up SSL (Recommended)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d melorimusicplatform.com -d www.melorimusicplatform.com
```

Certbot will:
- Generate free SSL certificate
- Update Nginx configuration
- Set up auto-renewal

## Step 9: Verify Deployment

### Check Application Status
```bash
pm2 status
# Should show "melori-node" as "online"
```

### Check Logs
```bash
pm2 logs melori-node --lines 50
```

### Test HTTP Response
```bash
curl http://localhost:3001
# Should return HTML
```

### Check Nginx Logs
```bash
sudo tail -f /var/log/nginx/melori-access.log
sudo tail -f /var/log/nginx/melori-error.log
```

### Access Website
Open browser and navigate to:
- `http://melorimusicplatform.com` (or your domain)
- `http://YOUR_VPS_IP` (if DNS not ready)

**Expected:** Homepage loads with music catalog

---

## Troubleshooting

### Application won't start
```bash
pm2 logs melori-node --lines 100
# Check for errors
```

Common issues:
- Missing `.env` file → Create it
- Port already in use → Change PORT in `.env`
- Build failed → Re-run `npm run build`

### Nginx 502 Bad Gateway
- Check if Node app is running: `pm2 status`
- Verify port 3001 is correct: `curl http://localhost:3001`
- Check Nginx error logs: `sudo tail -f /var/log/nginx/melori-error.log`

### Database not found
- Ensure `music.db` exists in project root
- Or let application create new database on first run

### File uploads fail
- Check directory permissions: `ls -la public/uploads/`
- Fix with: `chmod -R 755 public/uploads/`

### Email not sending
- Verify Gmail credentials in `.env`
- Check 2FA is enabled and using App Password
- Test with admin panel or purchase flow

---

## Maintenance

### Update Application
```bash
cd /home/m6/melori_music
git pull origin main
npm install --production
npm run build
pm2 restart melori-node
```

### Monitor Resources
```bash
pm2 monit
```

### Backup Database
```bash
cp music.db music.db.backup-$(date +%Y%m%d)
```

### View Logs
```bash
pm2 logs melori-node
```

### Restart Application
```bash
pm2 restart melori-node
```

---

## Security Best Practices

1. **Never commit `.env` file** - Contains sensitive credentials
2. **Use strong passwords** - Admin panel and server access
3. **Keep SSL certificate updated** - Let's Encrypt auto-renews
4. **Regular backups** - Database and uploaded files
5. **Monitor logs** - Check for suspicious activity
6. **Update dependencies** - Run `npm audit` regularly

---

## Admin Access

- **Admin Panel:** `http://melorimusicplatform.com/login`
- **Default Username:** admin
- **Password:** Set in `.env` as `ADMIN_PASSWORD`

**Change default credentials immediately after first login!**

---

## Support

For issues:
1. Check application logs: `pm2 logs melori-node`
2. Check Nginx logs: `/var/log/nginx/melori-*.log`
3. Review this deployment guide
4. Check GitHub repository issues

---

**🎵 Your music platform is now live! Share your music with the world! 🚀**
