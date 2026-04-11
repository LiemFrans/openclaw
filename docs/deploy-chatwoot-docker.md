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

> **IPv6 build error workaround:** If the build fails with a network error like `failed to do request ... connect: network is unreachable` (common on hosts without IPv6), strip the first line of the Dockerfile before building:
>
> ```bash
> sed '1d' Dockerfile > /tmp/Dockerfile.nosyntax
> DOCKER_BUILDKIT=1 docker build \
>   --build-arg OPENCLAW_EXTENSIONS="chatwoot" \
>   -t openclaw:chatwoot-latest \
>   -f /tmp/Dockerfile.nosyntax .
> ```

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

### 2.7 Fix volume permissions

The container runs as user `node` (uid 1000). The mounted volumes must be owned by this uid:

```bash
sudo chown -R 1000:1000 ./config ./workspace
```

> **Without this step**, the gateway will fail with `EACCES: permission denied` errors when writing config, canvas, workspace state, and plugin data.

### 2.8 Start the gateway

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

### 3.7 Configure allowed origins and trusted proxies

After setting up Nginx, the gateway needs to know about the HTTPS origin and Docker proxy:

```bash
# Allow the HTTPS origin for the Control UI
sudo docker compose exec openclaw-gateway \
  openclaw config set gateway.controlUi.allowedOrigins \
  '["http://localhost:18789","http://127.0.0.1:18789","https://oc.antive.id"]'

# Trust Docker bridge network so proxy headers (X-Forwarded-For) are recognized
sudo docker compose exec openclaw-gateway \
  openclaw config set gateway.trustedProxies \
  '["172.19.0.0/16","172.17.0.0/16"]'
```

The gateway will auto-restart when it detects config changes. If it doesn't:

```bash
sudo docker compose restart
```

> **Without `trustedProxies`**, the gateway logs `Proxy headers detected from untrusted address` and refuses to treat Nginx-forwarded connections as local.

### 3.8 Access the Control UI

Open `https://oc.antive.id` in your browser. You will be prompted for the **Gateway Token** (the value of `OPENCLAW_GATEWAY_TOKEN` from your `.env` file).

**If you see "pairing required":**

The Control UI requires a secure context (HTTPS) for device identity. If Nginx+SSL is set up correctly, `https://oc.antive.id` should work.

For **temporary plain HTTP access** (testing only, not recommended for production):

```bash
# Allow insecure token-only auth (no device identity)
sudo docker compose exec openclaw-gateway \
  openclaw config set gateway.controlUi.allowInsecureAuth true

# Break-glass: disable device identity check entirely
sudo docker compose exec openclaw-gateway \
  openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true
```

> **Security warning:** These flags send the token in plaintext and remove device pairing. Disable them once HTTPS is working:
>
> ```bash
> sudo docker compose exec openclaw-gateway \
>   openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth false
> sudo docker compose exec openclaw-gateway \
>   openclaw config set gateway.controlUi.allowInsecureAuth false
> ```

**Alternative: SSH Tunnel (quick, no SSL needed):**

```bash
# From your local machine
ssh -L 18789:127.0.0.1:18789 sapa@your-server

# Then open http://localhost:18789 in your browser
# (localhost is a secure context, so device identity works)
```

---

## Phase 4: Configure Model Provider

The gateway needs a model provider to generate AI responses. By default it uses `openai/gpt-5.4`.

### 4.1 Configure OpenAI

The provider config requires all fields at once. Edit the config JSON directly:

```bash
sudo nano /opt/app/openclaw-dev/config/openclaw.json
```

Add the `models` and `agents` sections (merge with existing config):

```json
{
  "agents": {
    "defaults": {
      "model": "openai/gpt-5-nano"
    }
  },
  "models": {
    "providers": {
      "openai": {
        "baseUrl": "https://api.openai.com/v1",
        "apiKey": "sk-proj-YOUR_OPENAI_API_KEY",
        "request": {},
        "models": [
          {
            "id": "gpt-5-nano",
            "name": "GPT-5 Nano"
          }
        ]
      }
    }
  }
}
```

> **Important:** Merge these keys into your existing `openclaw.json`. Do not replace the entire file. Make sure the JSON is valid (no missing commas between sections).

After editing, fix permissions and restart:

```bash
sudo chown 1000:1000 /opt/app/openclaw-dev/config/openclaw.json
sudo docker compose restart
```

Verify the model is picked up:

```bash
sudo docker compose logs --tail 20 | grep "agent model"
# Expected: [gateway] agent model: openai/gpt-5-nano
```

### 4.2 Configure Ollama (self-hosted alternative)

If you prefer a self-hosted model instead of OpenAI:

```bash
# Install Ollama on the host
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1

# Ollama must listen on all interfaces (not just localhost)
sudo systemctl edit ollama
# Add:
#   [Service]
#   Environment="OLLAMA_HOST=0.0.0.0"
sudo systemctl restart ollama
```

Add `extra_hosts` to `docker-compose.yml` so the container can reach the host:

```yaml
services:
  openclaw-gateway:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    # ... rest of config
```

Then configure in `openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": "ollama/llama3.1"
    }
  },
  "models": {
    "providers": {
      "ollama": {
        "baseUrl": "http://host.docker.internal:11434",
        "request": {},
        "models": [
          {
            "id": "llama3.1",
            "name": "Llama 3.1"
          }
        ]
      }
    }
  }
}
```

### 4.3 Config key reference

| Config path                        | Description                     | Example                                        |
| ---------------------------------- | ------------------------------- | ---------------------------------------------- |
| `agents.defaults.model`            | Default agent model             | `openai/gpt-5-nano`                            |
| `models.providers.<name>.baseUrl`  | Provider API endpoint           | `https://api.openai.com/v1`                    |
| `models.providers.<name>.apiKey`   | Provider API key                | `sk-proj-...`                                  |
| `models.providers.<name>.request`  | Request overrides (can be `{}`) | `{}`                                           |
| `models.providers.<name>.models`   | Array of model definitions      | `[{"id": "gpt-5-nano", "name": "GPT-5 Nano"}]` |
| `gateway.controlUi.allowedOrigins` | Allowed Control UI origins      | `["https://oc.antive.id"]`                     |
| `gateway.trustedProxies`           | Trusted proxy CIDRs             | `["172.19.0.0/16"]`                            |

---

## Phase 5: Configure Chatwoot Agent Bot

### 5.1 Set the webhook URL in Chatwoot

In your Chatwoot/Sapa admin panel:

1. Go to **Settings > Integrations > Agent Bots**
2. Click **Add Bot** (or edit existing)
3. Set:
   - **Bot name:** `Openclaw`
   - **Description:** `OpenClaw AI Agent`
   - **Webhook URL:** `https://oc.antive.id/chatwoot/webhook`
4. Click **Create Bot**

### 5.2 Assign the bot to an inbox

1. Go to **Settings > Inboxes**
2. Select the inbox you want the bot to handle
3. Under **Agent Bot**, select `Openclaw`
4. Save

### 5.3 Verify the webhook

Send a test message through the inbox. Check logs:

```bash
sudo docker compose logs -f openclaw-gateway 2>&1 | grep chatwoot
```

You should see inbound webhook processing and reply dispatch.

---

## Phase 6: Session Naming and Verification

The Chatwoot plugin creates descriptive session names using WhatsApp metadata from WAHA (WhatsApp HTTP API). This makes it easy to identify conversations in the Control UI and TUI.

### 6.1 Session name formats

Session names vary by conversation type:

| Type               | Format                                           | Example                                                               |
| ------------------ | ------------------------------------------------ | --------------------------------------------------------------------- |
| DM                 | `chatwoot:whatsapp-{lid}-{jid}-{contact name}`   | `chatwoot:whatsapp-4372444528669@lid-6285959823371@c.us-Parkee Frans` |
| Group              | `chatwoot:whatsapp-{group chat id}-{group name}` | `chatwoot:whatsapp-120363407872602773@g.us-Group Test AI (Group)`     |
| Fallback (no WAHA) | `chatwoot:{inboxId}:{conversationId}`            | `chatwoot:9:1702`                                                     |

The plugin detects DM vs group automatically:

- **Group**: sender has `identifier` ending in `@g.us` or `custom_attributes.waha_whatsapp_chat_id` ending in `@g.us`
- **DM**: sender has `waha_whatsapp_lid` or `waha_whatsapp_jid` in `custom_attributes`
- **Fallback**: when no WAHA attributes are present (non-WhatsApp inboxes)

### 6.2 Verify session names via gateway logs

After deploying, send a WhatsApp message to the bot and check the logs:

```bash
sudo docker compose logs -f --tail 50 | grep chatwoot
```

You should see log lines like:

```
[gateway] chatwoot: conversation=1702 sender=1658 peer=chatwoot:whatsapp-4372444528669@lid-6285959823371@c.us-Parkee Frans
```

For group messages:

```
[gateway] chatwoot: conversation=1703 sender=1678 peer=chatwoot:whatsapp-120363407872602773@g.us-Group Test AI (Group)
```

If `peer=` still shows the old format (`chatwoot:9:1702`), the updated image has not been deployed yet.

### 6.3 Verify session names in the Control UI

Open the Control UI at `https://oc.antive.id`. The session dropdown should show the descriptive name:

- `chatwoot:whatsapp-120363407872602773@g.us-Group Test AI (Group)` (group)
- `chatwoot:whatsapp-4372444528669@lid-6285959823371@c.us-Parkee Frans` (DM)

### 6.4 Verify session names in the TUI

From inside the Docker container:

```bash
sudo docker compose exec openclaw-gateway \
  openclaw tui --session "agent:main:chatwoot:group:chatwoot:whatsapp-120363407872602773@g.us-group test ai (group)"
```

The TUI header will show the full session name.

### 6.5 Reset old sessions

Sessions created before the descriptive naming update retain their old labels. To see the new format, reset old sessions and send a new message:

**Via Control UI:**

1. Go to **Sessions** in the sidebar
2. Find the old session (e.g. `chatwoot:g-9-1678`)
3. Click **Reset** to delete it
4. Send a new message from WhatsApp -- a new session with the descriptive name will be created

**Via CLI inside the container:**

```bash
sudo docker compose exec openclaw-gateway \
  openclaw sessions list

# Reset a specific session
sudo docker compose exec openclaw-gateway \
  openclaw sessions reset --session "agent:main:chatwoot:group:chatwoot:9:1678"
```

### 6.6 Verify session files on disk

Session data is stored inside the container at `~/.openclaw/agents/*/sessions/`:

```bash
sudo docker compose exec openclaw-gateway \
  ls ~/.openclaw/agents/main/sessions/
```

The `sessions.json` file inside that directory contains session metadata including labels and origin information.

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

### Startup errors

**EACCES: permission denied (mkdir, open):**

The container runs as user `node` (uid 1000). Volume directories must be owned by that uid:

```bash
sudo chown -R 1000:1000 ./config ./workspace
sudo docker compose down && sudo docker compose up -d
```

**Config invalid / JSON5 parse failed:**

Invalid JSON in `openclaw.json`. Common causes:

- Missing comma between sections (e.g. after `"meta": { ... }` before `"models": { ... }`)
- Trailing commas in arrays/objects

Validate before restarting:

```bash
sudo python3 -c "import json; json.load(open('/opt/app/openclaw-dev/config/openclaw.json'))"
```

If the container is in a crash loop, use `docker compose down && docker compose up -d` instead of `restart`.

**Container exits immediately:**

Check logs: `sudo docker compose logs openclaw-gateway`. Most common cause is invalid JSON in config.

### Control UI access

**"origin not allowed":**

The browser origin is not in the allowlist. Add it:

```bash
sudo docker compose exec openclaw-gateway \
  openclaw config set gateway.controlUi.allowedOrigins \
  '["http://localhost:18789","http://127.0.0.1:18789","https://oc.antive.id"]'
```

> Watch for typos like `http://http://...` (double protocol).

**"control ui requires device identity (use HTTPS or localhost secure context)":**

The Control UI needs a secure context for device identity crypto. Solutions:

1. **HTTPS via Nginx** (recommended) -- see Phase 3
2. **SSH tunnel:** `ssh -L 18789:127.0.0.1:18789 sapa@server` then open `http://localhost:18789`
3. **Break-glass flags** (testing only):
   ```bash
   sudo docker compose exec openclaw-gateway \
     openclaw config set gateway.controlUi.allowInsecureAuth true
   sudo docker compose exec openclaw-gateway \
     openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true
   ```

**"pairing required":**

Usually caused by `dangerouslyDisableDeviceAuth` being `false` while accessing via non-localhost. Set it to `true` for HTTP testing or use HTTPS.

**"Proxy headers detected from untrusted address":**

Nginx forwards requests through Docker bridge network. Add trusted proxies:

```bash
sudo docker compose exec openclaw-gateway \
  openclaw config set gateway.trustedProxies \
  '["172.19.0.0/16","172.17.0.0/16"]'
```

### Model provider

**"No API key found for provider openai":**

No OpenAI API key configured. Add the full `models.providers.openai` block to `openclaw.json` (see Phase 4).

**Config validation: "Unrecognized key" or "expected string/array, received undefined":**

The provider schema requires `baseUrl`, `request`, and `models` fields all at once. You cannot set them one at a time via CLI. Edit `openclaw.json` directly and add the full provider block.

| Wrong path                | Correct path                     |
| ------------------------- | -------------------------------- |
| `providers.openai.apiKey` | `models.providers.openai.apiKey` |
| `ai.model`                | `agents.defaults.model`          |

### Webhook

**Webhook returns 503 "not configured":**

Check `config/openclaw.json` has valid `baseUrl`, `apiKey`, and `accountId` under `channels.chatwoot`.

**Webhook returns 401 "Unauthorized":**

HMAC signature verification failed. Verify `webhookSecret` matches Chatwoot, or set it to `""` to skip verification.

### Network

**Port conflict with existing container:**

OpenClaw uses 18789 by default. Change `OPENCLAW_GATEWAY_PORT` in `.env` if needed.

### Session names still show old format

**Control UI shows `chatwoot:g-9-1678` instead of descriptive name:**

Sessions created before the descriptive naming update retain their old labels. Reset the old session and send a new message (see Phase 6.5).

**Log shows `peer=chatwoot:9:1702` instead of descriptive name:**

The deployed image does not include the descriptive naming changes. Rebuild and redeploy (see Updating section).

**Fallback format `chatwoot:{inboxId}:{conversationId}` in logs:**

The sender's Chatwoot contact does not have WAHA WhatsApp custom attributes. This happens when:

- The inbox is not connected via WAHA (e.g. email, web widget)
- The WAHA instance has not synced contact attributes to Chatwoot
- The contact was created manually without WhatsApp metadata

### Useful commands

```bash
# Enter the gateway container shell
sudo docker compose exec openclaw-gateway bash

# Run OpenClaw CLI inside the container
sudo docker compose exec openclaw-gateway openclaw channels status
sudo docker compose exec openclaw-gateway openclaw config get channels.chatwoot

# View current config
sudo cat /opt/app/openclaw-dev/config/openclaw.json

# Validate JSON
sudo python3 -c "import json; json.load(open('/opt/app/openclaw-dev/config/openclaw.json'))" && echo 'Valid JSON'

# Full restart (clears crash loops)
sudo docker compose down && sudo docker compose up -d

# View live logs
sudo docker compose logs -f --tail 50

# Filter Chatwoot-specific logs
sudo docker compose logs -f --tail 100 | grep chatwoot

# List active sessions
sudo docker compose exec openclaw-gateway openclaw sessions list

# Reset a specific session
sudo docker compose exec openclaw-gateway openclaw sessions reset --session "SESSION_KEY"

# Open TUI inside container
sudo docker compose exec -it openclaw-gateway openclaw tui
```
