#!/bin/bash
# Melori Music Platform - VPS Deployment Script
# Run this script on your VPS as user m6

set -e  # Exit on error

echo "========================================="
echo "Melori Music Platform - Deployment"
echo "========================================="

# Configuration
PROJECT_DIR="/home/m6/melori_music"
NGINX_CONFIG="/etc/nginx/sites-available/melori"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as correct user
if [ "$USER" != "m6" ]; then
    echo -e "${RED}Error: This script must be run as user 'm6'${NC}"
    echo "Run: su - m6"
    exit 1
fi

cd $PROJECT_DIR || exit 1

echo -e "\n${YELLOW}Step 1: Checking prerequisites...${NC}"
node_version=$(node -v)
npm_version=$(npm -v)
pm2_version=$(pm2 -v 2>/dev/null || echo "not installed")

echo "Node: $node_version"
echo "NPM: $npm_version"
echo "PM2: $pm2_version"

if [ "$pm2_version" == "not installed" ]; then
    echo -e "${RED}PM2 not installed. Installing...${NC}"
    npm install -g pm2
fi

echo -e "\n${YELLOW}Step 2: Installing dependencies...${NC}"
npm install --production

echo -e "\n${YELLOW}Step 3: Building production assets...${NC}"
export NODE_ENV=production
npm run build

# Verify build output
if [ ! -f "dist/index.cjs" ]; then
    echo -e "${RED}Error: Build failed - dist/index.cjs not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Build successful${NC}"

echo -e "\n${YELLOW}Step 4: Creating directories...${NC}"
mkdir -p logs
mkdir -p public/uploads/music_files
mkdir -p public/uploads/album_art
mkdir -p public/uploads/avatars

echo -e "\n${YELLOW}Step 5: Checking environment file...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}Warning: .env file not found${NC}"
    echo "Creating from .env.production template..."
    cp .env.production .env
    echo -e "${YELLOW}IMPORTANT: Edit .env and set your configuration${NC}"
    echo "nano .env"
    read -p "Press enter when done editing .env..."
fi

# Verify critical env variables
if ! grep -q "PUBLIC_BASE_URL=http" .env; then
    echo -e "${RED}Error: PUBLIC_BASE_URL not set in .env${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Environment configured${NC}"

echo -e "\n${YELLOW}Step 6: Stopping existing PM2 processes...${NC}"
pm2 delete melori-node 2>/dev/null || true

echo -e "\n${YELLOW}Step 7: Starting application with PM2...${NC}"
pm2 start ecosystem.config.cjs --env production

# Wait for app to start
sleep 3

# Check if app is running
if pm2 status | grep -q "melori-node.*online"; then
    echo -e "${GREEN}✓ Application started successfully${NC}"
else
    echo -e "${RED}Error: Application failed to start${NC}"
    pm2 logs melori-node --lines 20
    exit 1
fi

echo -e "\n${YELLOW}Step 8: Saving PM2 process list...${NC}"
pm2 save

echo -e "\n${YELLOW}Step 9: Setting up PM2 startup...${NC}"
echo "Run the following command:"
pm2 startup

echo -e "\n${YELLOW}Step 10: Application health check...${NC}"
sleep 2

if curl -s http://localhost:3001 > /dev/null; then
    echo -e "${GREEN}✓ Application responding on port 3001${NC}"
else
    echo -e "${RED}Warning: Application not responding${NC}"
fi

echo -e "\n========================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "========================================="

echo -e "\nNext steps:"
echo "1. Configure Nginx (see nginx-melori.conf)"
echo "2. Copy nginx-melori.conf to /etc/nginx/sites-available/melori"
echo "3. Enable site: sudo ln -s /etc/nginx/sites-available/melori /etc/nginx/sites-enabled/"
echo "4. Test Nginx: sudo nginx -t"
echo "5. Reload Nginx: sudo systemctl reload nginx"

echo -e "\nApplication logs:"
echo "pm2 logs melori-node"

echo -e "\nApplication status:"
echo "pm2 status"
