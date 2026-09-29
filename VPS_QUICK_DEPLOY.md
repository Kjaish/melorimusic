# VPS Deployment - Quick Commands
## For user: adminkarl @ 160.153.186.249

### Connect to VPS
```powershell
ssh adminkarl@160.153.186.249
```

---

## Once Connected, Run These Commands Step-by-Step:

### 1. Update System
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js v20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v    # Verify
```

### 3. Install PM2
```bash
sudo npm install -g pm2
pm2 -v
```

### 4. Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl status nginx
```

### 5. Install Git
```bash
sudo apt install -y git
git --version
```

### 6. Create Directory & Clone Repository
```bash
cd /home
sudo mkdir -p adminkarl
cd adminkarl
sudo git clone https://github.com/marediasoftm18/melorimusicplatform.git melori_music
cd melori_music
```

### 7. Install Dependencies & Build
```bash
sudo npm install --production
export NODE_ENV=production
sudo npm run build
ls -lh dist/index.cjs    # Verify build
```

### 8. Create Directories
```bash
sudo mkdir -p logs public/uploads/{music_files,album_art,avatars,temp}
sudo chmod -R 755 public/uploads
```

### 9. Create .env File
```bash
sudo nano .env
```

Paste this (update credentials):
```env
NODE_ENV=production
PORT=3001
PUBLIC_BASE_URL=http://melorimusicplatform.com
DATABASE_URL=sqlite:music.db
SESSION_SECRET=<GENERATE_NEW>
ADMIN_PASSWORD=<YOUR_PASSWORD>
EMAIL_USER=<your-gmail>
EMAIL_PASS=<your-app-password>
UPLOAD_DIR=public/uploads
DEBUG=false
```

Save: `Ctrl+X`, `Y`, `Enter`

### 10. Start Application
```bash
sudo pm2 start ecosystem.config.cjs --env production
pm2 status      # Should show "online"
pm2 logs melori-node --lines 20
sudo pm2 save
sudo pm2 startup
```

### 11. Configure Nginx
```bash
sudo cp nginx-melori.conf /etc/nginx/sites-available/melori
sudo ln -s /etc/nginx/sites-available/melori /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 12. Test
```bash
curl http://localhost:3001    # Should return HTML
curl http://160.153.186.249   # Should return HTML
```

---

## Configure DNS (in GoDaddy)
- Go to: https://dnsmanagement.godaddy.com/
- Add A record: `@` → `160.153.186.249`
- Add A record: `www` → `160.153.186.249`

## Setup SSL (after DNS propagates)
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d melorimusicplatform.com -d www.melorimusicplatform.com
```

**Done! Visit: https://melorimusicplatform.com** 🎉
