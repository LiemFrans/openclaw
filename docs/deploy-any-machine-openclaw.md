# Deploy OpenClaw Natively on Any Machine (Without Docker)

This guide covers deploying OpenClaw directly on a Linux machine without Docker, using rsync from a local dev machine. Tested on Ubuntu/Zorin OS with Node.js 22+.

## Prerequisites

**Local dev machine:**

- OpenClaw repo cloned with dependencies installed (`pnpm install`)
- SSH access to the remote machine

**Remote machine:**

- Node.js 22+ installed
- npm available
- SSH server running

## 1. Build Locally

On your local dev machine, build everything:

```bash
cd /path/to/openclaw
pnpm build
pnpm ui:build
```

## 2. Rsync to Remote

Transfer the built project to the remote machine. This avoids needing pnpm/bun on the remote:

```bash
rsync -avz --exclude='node_modules' --exclude='.git' \
  /path/to/openclaw/ user@remote-ip:~/openclaw/
```

Then sync the Control UI separately (it lives in `dist/control-ui/`):

```bash
rsync -avz dist/control-ui/ user@remote-ip:~/openclaw/dist/control-ui/
```

Also sync workspace templates (needed for `openclaw onboard`):

```bash
ssh user@remote-ip "mkdir -p ~/openclaw/docs/reference/templates"
rsync -avz docs/reference/templates/ user@remote-ip:~/openclaw/docs/reference/templates/
```

## 3. Install Production Dependencies on Remote

SSH into the remote machine and install only production deps:

```bash
ssh user@remote-ip
cd ~/openclaw
npm install --omit=dev --ignore-scripts
```

> `--ignore-scripts` avoids postinstall failures from dev-only tooling.

## 4. Create a CLI Symlink

Make the `openclaw` command available system-wide:

```bash
sudo ln -sf /home/$USER/openclaw/openclaw.mjs /usr/local/bin/openclaw
```

Verify it works:

```bash
openclaw --version
```

## 5. Run Onboarding

```bash
openclaw onboard
```

This walks you through provider setup (OpenAI, Anthropic, etc.), model selection, and channel configuration (WhatsApp, Telegram, etc.).

## 6. Configure the Gateway

Set the gateway to bind on LAN so it is reachable from other devices:

```bash
openclaw config set gateway.mode local
openclaw config set gateway.bind lan
```

> Use `loopback` instead of `lan` if you only need localhost access.

## 7. Create a systemd Service

Create `/etc/systemd/system/openclaw.service`:

```ini
[Unit]
Description=OpenClaw Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<your-username>
Group=<your-username>
WorkingDirectory=/home/<your-username>/openclaw
ExecStart=/usr/bin/node /home/<your-username>/openclaw/openclaw.mjs gateway run --bind lan --port 18789 --force
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=HOME=/home/<your-username>

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable openclaw
sudo systemctl start openclaw
```

Check status:

```bash
sudo systemctl status openclaw
sudo journalctl -u openclaw -f
```

## 8. (Optional) Nginx Reverse Proxy

Install nginx:

```bash
sudo apt install nginx
```

Create `/etc/nginx/sites-available/openclaw`:

```nginx
upstream openclaw_gateway {
    server 127.0.0.1:18789;
}

server {
    listen 80;
    server_name your-domain.example.com;

    location / {
        proxy_pass http://openclaw_gateway;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/openclaw /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

If using nginx as a proxy, configure OpenClaw to trust it:

```bash
openclaw config set gateway.trustedProxies '["127.0.0.1"]'
```

## 9. (Optional) Cloudflare Tunnel for Public Access

If you want to expose the gateway via a domain (e.g. `oc.example.com`) without opening ports:

```bash
# Install cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb

# Authenticate and create tunnel
cloudflared tunnel login
cloudflared tunnel create openclaw
```

Configure the tunnel to point directly to the gateway (bypassing nginx):

```yaml
# ~/.cloudflared/config.yml
tunnel: <tunnel-id>
credentials-file: /home/<your-username>/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: oc.example.com
    service: http://localhost:18789
  - service: http_status:404
```

Route the DNS and run:

```bash
cloudflared tunnel route dns openclaw oc.example.com
sudo cloudflared service install
sudo systemctl start cloudflared
```

Then allow the domain in OpenClaw:

```bash
openclaw config set gateway.controlUi.allowedOrigins '["https://oc.example.com"]'
```

## 10. (Optional) Disable Device Pairing for Remote Access

By default, the Control UI requires device pairing (a code shown in the terminal). For headless/remote deployments where you cannot see the terminal, you can disable it:

```bash
openclaw config set gateway.controlUi.dangerouslyDisableDeviceAuth true
```

> **Security warning:** This removes the device-pairing gate. Only use this on private networks or behind authentication (Cloudflare Access, VPN, etc.).

## Updating

To update the deployment from your local dev machine:

```bash
# On local: pull latest, rebuild
cd /path/to/openclaw
git pull
pnpm install
pnpm build
pnpm ui:build

# Rsync changes to remote
rsync -avz --exclude='node_modules' --exclude='.git' \
  /path/to/openclaw/ user@remote-ip:~/openclaw/
rsync -avz dist/control-ui/ user@remote-ip:~/openclaw/dist/control-ui/

# On remote: reinstall deps if package.json changed
ssh user@remote-ip "cd ~/openclaw && npm install --omit=dev --ignore-scripts"

# Restart
ssh user@remote-ip "sudo systemctl restart openclaw"
```

## Useful Commands

| Command                            | Description                |
| ---------------------------------- | -------------------------- |
| `openclaw channels status --probe` | Check channel connectivity |
| `openclaw config list`             | Show current config        |
| `openclaw doctor`                  | Diagnose common issues     |
| `openclaw security audit --deep`   | Run security audit         |
| `sudo journalctl -u openclaw -f`   | Follow gateway logs        |
| `sudo systemctl restart openclaw`  | Restart the gateway        |

## Troubleshooting

**Gateway won't start / port in use:**

```bash
ss -ltnp | grep 18789
# Kill any stale process, then restart
sudo systemctl restart openclaw
```

**Control UI returns 503:**
Make sure `dist/control-ui/` exists on the remote. Rebuild and rsync if missing.

**"pairing required" error in browser:**
Set `dangerouslyDisableDeviceAuth` to `true` (see step 10), or pair via the terminal using the code shown in gateway logs.

**Rate limiting / token errors:**
Close all browser tabs, restart the gateway, clear browser site data, then reconnect with a single tab using `https://your-domain/#token=<gateway-auth-token>`.

**WhatsApp login:**

```bash
openclaw channels login
# Select WhatsApp, scan the QR code with your phone
```
