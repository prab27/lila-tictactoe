# Deploying to DigitalOcean (Droplet)

## Prerequisites
- DigitalOcean account
- A domain name (optional but recommended)
- SSH key added to DigitalOcean

---

## Step 1: Create a Droplet

- Image: Ubuntu 22.04 LTS
- Size: Basic, 2 GB RAM / 1 CPU ($12/month min for Nakama)
- Region: Choose nearest to your users
- Authentication: SSH Key

---

## Step 2: Install Docker on Droplet

```bash
ssh root@YOUR_DROPLET_IP

# Install Docker
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

---

## Step 3: Upload Backend and Start Nakama

```bash
# On your local machine, copy the backend
scp -r ./backend root@YOUR_DROPLET_IP:/opt/lila-tictactoe/

# Copy docker-compose
scp ./docker-compose.yml root@YOUR_DROPLET_IP:/opt/lila-tictactoe/

# SSH into droplet
ssh root@YOUR_DROPLET_IP
cd /opt/lila-tictactoe

# Build backend TypeScript
cd backend
npm install
npm run build
cd ..

# Start services
docker compose up -d

# Check logs
docker compose logs -f nakama
```

---

## Step 4: Build and Deploy Frontend

```bash
# On your local machine
cd frontend
cp .env.example .env.production

# Edit .env.production:
# REACT_APP_NAKAMA_HOST=YOUR_DROPLET_IP
# REACT_APP_NAKAMA_PORT=7350
# REACT_APP_NAKAMA_SSL=false
# REACT_APP_NAKAMA_KEY=defaultkey

npm install
REACT_APP_NAKAMA_HOST=YOUR_DROPLET_IP npm run build
```

Deploy `frontend/build/` folder to:
- **Netlify**: drag & drop the build folder at netlify.com
- **Vercel**: `npx vercel --prod` from frontend directory
- **GitHub Pages**: push build to `gh-pages` branch

---

## Step 5: Configure Firewall

```bash
# Allow Nakama HTTP API and WebSocket
ufw allow 7350/tcp
ufw allow 7349/tcp
ufw allow 7351/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

---

## Step 6: SSL with NGINX (Optional but Recommended)

```bash
apt-get install -y nginx certbot python3-certbot-nginx

# Create nginx config
cat > /etc/nginx/sites-available/nakama << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN;

    location / {
        proxy_pass http://localhost:7350;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

ln -s /etc/nginx/sites-available/nakama /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL certificate
certbot --nginx -d YOUR_DOMAIN
```

Then update frontend `.env.production`:
```
REACT_APP_NAKAMA_HOST=YOUR_DOMAIN
REACT_APP_NAKAMA_PORT=443
REACT_APP_NAKAMA_SSL=true
```

---

## Nakama Server Endpoint

After deployment your endpoints are:
- **HTTP API**: `http://YOUR_DROPLET_IP:7350` (or `https://YOUR_DOMAIN`)
- **Console**: `http://YOUR_DROPLET_IP:7351` (admin: admin/password)
- **WebSocket**: `ws://YOUR_DROPLET_IP:7350` (or `wss://YOUR_DOMAIN`)
