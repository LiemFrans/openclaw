# Deploy OpenClaw + Chatwoot Plugin with Docker

This guide covers building the OpenClaw Docker image locally (with the Chatwoot channel plugin) and deploying it to a remote production server.

## Prerequisites

### Local machine

- Docker with BuildKit (Docker 23+ recommended)
- Git with the `frans/feature/AddChannelChatwoot` branch checked out
- SSH access to the remote server (`ssh sapa-zc`)

### Remote server (sapa-zeroclaw)

- Docker and Docker Compose installed
- Nginx installed (`sudo apt install nginx`)
- A domain pointing to the server (e.g. `oc.antive.id`)
- Directory `/opt/app/openclaw-dev` created
- User `sapa` with `sudo` access

---

## Phase 1: Build the Docker Image Locally

### 1.1 Checkout the branch

```bash
cd ~/Documents/github/ai-chat/openclaw
git checkout frans/feature/AddChannelChatwoot
```

### 1.2 Build the production image with the Chatwoot extension

The `OPENCLAW_EXTENSIONS` build arg tells the Dockerfile which bundled plugins to include:

```bash
DOCKER_BUILDKIT=1 docker build \
  --build-arg OPENCLAW_EXTENSIONS="chatwoot" \
  -t openclaw:chatwoot-latest \
  .
```

> **Note:** This builds Node 24 bookworm with the Chatwoot plugin's runtime dependencies installed. Build takes 5-10 minutes depending on your machine.

### 1.3 Save the image as a tarball

```bash
docker save openclaw:chatwoot-latest | gzip > /tmp/openclaw-chatwoot-latest.tar.gz
```

### 1.4 Transfer to the remote server

```bash
scp /tmp/openclaw-chatwoot-latest.tar.gz sapa-zc:/opt/app/openclaw-dev/
```

---

## Phase 2: Deploy to Remote Server

### 2.1 SSH into the server

```bash
ssh sapa-zc
cd /opt/app/openclaw-dev
```

### 2.2 Load the Docker image

```bash
sudo docker load < openclaw-chatwoot-latest.tar.gz
```

Verify:

```bash
sudo docker images | grep openclaw
# Should show: openclaw   chatwoot-latest   ...
```

### 2.3 Create the directory structure

```bash
mkdir -p config workspace
```

### 2.4 Create the `.env` file

```bash
cat > .env << 'EOF'
# OpenClaw Docker configuration
OPENCLAW_IMAGE=openclaw:chatwoot-latest
OPENCLAW_CONFIG_DIR=./config
OPENCLAW_WORKSPACE_DIR=./workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_TZ=Asia/Jakarta

# Gateway auth token (generate one)
OPENCLAW_GATEWAY_TOKEN=
EOF
```

Generate and set a gateway token:

```bash
TOKEN=$(openssl rand -hex 32)
sed -i "s/^OPENCLAW_GATEWAY_TOKEN=$/OPENCLAW_GATEWAY_TOKEN=$TOKEN/" .env
echo "Gateway token: $TOKEN"
```

> **Save this token** -- you need it for the control UI and API access.

### 2.5 Create `docker-compose.yml`

```bash
cat > docker-compose.yml << 'YAML'
services:
  openclaw-gateway:
    image: ${OPENCLAW_IMAGE:-openclaw:chatwoot-latest}
    environment:
      HOME: /home/node
      TERM: xterm-256color
      OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN:-}
      TZ: ${OPENCLAW_TZ:-Asia/Jakarta}
    volumes:
      - ${OPENCLAW_CONFIG_DIR:-./config}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR:-./workspace}:/home/node/.openclaw/workspace
    ports:
      - "${OPENCLAW_GATEWAY_PORT:-18789}:18789"
      - "${OPENCLAW_BRIDGE_PORT:-18790}:18790"
    init: true
    restart: unless-stopped
    command:
      [
        "node",
        "dist/index.js",
        "gateway",
        "--bind",
        "${OPENCLAW_GATEWAY_BIND:-lan}",
        "--port",
        "18789",
        "--force",
      ]
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:18789/healthz').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
        ]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 20s
YAML
```

### 2.6 Configure OpenClaw for Chatwoot

Create the initial config with Chatwoot channel settings:

```bash
cat > config/openclaw.json << 'JSON'
{
  "gateway": {
    "mode": "local",
    "auth": {
      "token": ""
    }
  },
  "channels": {
    "chatwoot": {
      "enabled": true,
      "baseUrl": "https://your-chatwoot-instance.example.com",
      "apiKey": "YOUR_CHATWOOT_AGENT_BOT_ACCESS_TOKEN",
      "accountId": "YOUR_CHATWOOT_ACCOUNT_ID",
      "webhookSecret": "YOUR_WEBHOOK_SECRET"
    }
  }
}
JSON
```

Then patch the gateway token into the config:

```bash
TOKEN=$(grep OPENCLAW_GATEWAY_TOKEN .env | cut -d= -f2)
sudo apt-get install -y jq 2>/dev/null || true
jq --arg t "$TOKEN" '.gateway.auth.token = $t' config/openclaw.json > config/tmp.json \
  && mv config/tmp.json config/openclaw.json
```

**Replace the Chatwoot values with your actual credentials:**

| Field           | Where to find it                                                        |
| --------------- | ----------------------------------------------------------------------- |
| `baseUrl`       | Your Chatwoot/Sapa instance URL (e.g. `https://sapa.antive.id`)         |
| `apiKey`        | Chatwoot Settings > Integrations > Agent Bots > your bot's access token |
| `accountId`     | Chatwoot account ID (visible in URL: `/app/accounts/ACCOUNT_ID/...`)    |
| `webhookSecret` | Optional HMAC secret for webhook signature verification                 |

### 2.7 Start the gateway

```bash
sudo docker compose up -d
```

Check status:

```bash
sudo docker compose logs -f --tail 50
```

Verify health:

```bash
sudo docker compose ps
# Should show: openclaw-gateway   running (healthy)

curl -s http://127.0.0.1:18789/healthz
# Should return: {"status":"ok"}
```

---

## Phase 3: Nginx Reverse Proxy with SSL

Nginx sits in front of the OpenClaw gateway, terminates TLS, and proxies requests to `127.0.0.1:18789`. This is required so that Chatwoot can reach the webhook at `https://oc.antive.id/chatwoot/webhook`.

### 3.1 Install Nginx and Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 3.2 Create the Nginx site config

```bash
sudo tee /etc/nginx/sites-available/oc.antive.id << 'NGINX'
server {
    listen 80;
    server_name oc.antive.id;

    # Redirect HTTP to HTTPS (certbot will add the redirect,
    # but this serves as a fallback)
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name oc.antive.id;

    # SSL certificates (managed by certbot)
    ssl_certificate     /etc/letsencrypt/live/oc.antive.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/oc.antive.id/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # Chatwoot webhook endpoint (no auth required -- plugin handles HMAC verification)
    location /chatwoot/webhook {
        proxy_pass http://127.0.0.1:18789/chatwoot/webhook;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Chatwoot sends JSON payloads; allow up to 1MB
        client_max_body_size 1m;

        # Pass through Chatwoot/Sapa HMAC headers
        proxy_pass_header X-Chatwoot-Signature;
        proxy_pass_header X-Chatwoot-Timestamp;
        proxy_pass_header X-Sapa-Signature;
        proxy_pass_header X-Sapa-Timestamp;
    }

    # Gateway API, control UI, health checks
    location / {
        proxy_pass http://127.0.0.1:18789;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (for bridge/control UI)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Timeouts for long-running agent responses
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        client_max_body_size 10m;
    }
}
NGINX
```

### 3.3 Enable the site

```bash
sudo ln -sf /etc/nginx/sites-available/oc.antive.id /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 3.4 Obtain SSL certificate with Certbot

```bash
sudo certbot --nginx -d oc.antive.id --non-interactive --agree-tos -m your-email@example.com
```

Certbot will automatically:

- Obtain a Let's Encrypt certificate
- Update the Nginx config with SSL paths
- Set up auto-renewal via systemd timer

Verify auto-renewal:

```bash
sudo certbot renew --dry-run
```

### 3.5 Verify the full chain

```bash
# Health check through Nginx
curl -s https://oc.antive.id/healthz
# Expected: {"status":"ok"}

# Webhook endpoint reachable
curl -s -X POST https://oc.antive.id/chatwoot/webhook \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'
# Expected: 200 with {"status":"ignored","reason":"event: test"}
```

### 3.6 Firewall (if UFW is enabled)

```bash
sudo ufw allow 'Nginx Full'
sudo ufw status
```

---

## Phase 4: Configure Chatwoot Agent Bot

### 4.1 Set the webhook URL in Chatwoot

In your Chatwoot/Sapa admin panel:

1. Go to **Settings > Integrations > Agent Bots**
2. Click **Add Bot** (or edit existing)
3. Set:
   - **Bot name:** `Openclaw`
   - **Description:** `OpenClaw AI Agent`
   - **Webhook URL:** `https://oc.antive.id/chatwoot/webhook`
4. Click **Create Bot**

### 4.2 Assign the bot to an inbox

1. Go to **Settings > Inboxes**
2. Select the inbox you want the bot to handle
3. Under **Agent Bot**, select `Openclaw`
4. Save

### 4.3 Verify the webhook

Send a test message through the inbox. Check logs:

```bash
sudo docker compose logs -f openclaw-gateway 2>&1 | grep chatwoot
```

You should see inbound webhook processing and reply dispatch.

---

## Updating

When you rebuild with new changes:

```bash
# On local machine
git pull
DOCKER_BUILDKIT=1 docker build \
  --build-arg OPENCLAW_EXTENSIONS="chatwoot" \
  -t openclaw:chatwoot-latest .
docker save openclaw:chatwoot-latest | gzip > /tmp/openclaw-chatwoot-latest.tar.gz
scp /tmp/openclaw-chatwoot-latest.tar.gz sapa-zc:/opt/app/openclaw-dev/

# On remote server
cd /opt/app/openclaw-dev
sudo docker load < openclaw-chatwoot-latest.tar.gz
sudo docker compose down
sudo docker compose up -d
```

---

## Troubleshooting

**Webhook returns 503 "not configured":**
Check `config/openclaw.json` has valid `baseUrl`, `apiKey`, and `accountId` under `channels.chatwoot`.

**Webhook returns 401 "Unauthorized":**
The HMAC signature verification failed. Verify `webhookSecret` matches what Chatwoot sends, or remove it to skip verification.

**Container exits immediately:**
Check logs with `sudo docker compose logs openclaw-gateway`. Common cause: invalid JSON in `config/openclaw.json`.

**Port conflict with existing container:**
The existing `zeroclaw` container uses port 3100. OpenClaw uses 18789 by default, so there should be no conflict. If needed, change `OPENCLAW_GATEWAY_PORT` in `.env`.
