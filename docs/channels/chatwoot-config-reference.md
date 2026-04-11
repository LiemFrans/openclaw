# Chatwoot Channel Configuration Reference

Complete reference for all `channels.chatwoot` configuration settings in OpenClaw, with examples and usage patterns.

All settings live under the `channels.chatwoot` key in `openclaw.json` (JSON5 format). Connection credentials can also be set via environment variables.

---

## Table of Contents

- [Connection Settings](#connection-settings)
- [Access Control](#access-control)
- [Delivery](#delivery)
- [Account Management](#account-management)
- [Multi-Account](#multi-account)
- [Environment Variables](#environment-variables)
- [Validation Rules](#validation-rules)
- [Full Configuration Examples](#full-configuration-examples)
- [Usage Patterns](#usage-patterns)
- [Settings Quick Reference](#settings-quick-reference)

---

## Connection Settings

These are required for the Chatwoot channel to function. They connect OpenClaw to your Chatwoot instance.

### `baseUrl`

The URL of your Chatwoot instance.

- **Type:** `string`
- **Required:** Yes

```json5
{
  channels: {
    chatwoot: {
      baseUrl: "https://app.chatwoot.com",
    },
  },
}
```

For self-hosted Chatwoot, use your own domain:

```json5
{
  channels: {
    chatwoot: {
      baseUrl: "https://chatwoot.yourcompany.com",
    },
  },
}
```

### `apiKey`

Chatwoot API access token. This is the **Agent Bot access token** generated in your Chatwoot instance under Settings > Applications > Agent Bot.

- **Type:** `string`
- **Required:** Yes

### `accountId`

Your Chatwoot account ID. Found in the URL when logged into Chatwoot (e.g., `https://app.chatwoot.com/app/accounts/1/...` — the account ID is `1`).

- **Type:** `string`
- **Required:** Yes

### `webhookSecret`

Secret token used to verify incoming webhook signatures from Chatwoot. Set the same value in both OpenClaw config and Chatwoot webhook settings.

- **Type:** `string`
- **Required:** Recommended (for security)

---

## Access Control

### `dmPolicy`

Controls who can interact with the bot through Chatwoot conversations.

| Value         | Description                                                    | Default |
| ------------- | -------------------------------------------------------------- | ------- |
| `"open"`      | All incoming conversations are accepted                        | **Yes** |
| `"pairing"`   | Only paired users can chat (pairing via `/pair` or onboarding) |         |
| `"allowlist"` | Only senders in `allowFrom` can chat                           |         |
| `"disabled"`  | Block all incoming messages                                    |         |

The default is `"open"` (unlike WhatsApp which defaults to `"pairing"`), because Chatwoot already manages inbox access control, agent assignments, and conversation routing on its own. OpenClaw trusts Chatwoot's access layer.

### `allowFrom`

Array of allowed sender identifiers. Accepts Chatwoot contact IDs (numbers) or phone numbers (strings). Only relevant when `dmPolicy` is `"allowlist"`.

- **Type:** `(string | number)[]`

```json5
{
  channels: {
    chatwoot: {
      dmPolicy: "allowlist",
      allowFrom: [42, 108, "+628123456789"],
    },
  },
}
```

### `defaultTo`

Default delivery target for CLI `openclaw message send --deliver` when no explicit `--reply-to` is provided.

- **Type:** `string`

---

## Delivery

### `blockStreaming`

Disable streaming/block delivery for this channel. When `true`, OpenClaw waits for the full response to be generated before sending it as a single message, rather than streaming partial blocks.

- **Type:** `boolean`
- **Default:** not set (streaming behavior depends on gateway defaults)

This is useful when you want cleaner message delivery in Chatwoot — a single complete message instead of multiple streamed fragments.

```json5
{
  channels: {
    chatwoot: {
      blockStreaming: true,
    },
  },
}
```

---

## Account Management

### `name`

Display name for this Chatwoot account, shown in CLI and UI lists.

- **Type:** `string`

### `enabled`

Enable or disable this Chatwoot account. Set to `false` to temporarily disable without removing the configuration.

- **Type:** `boolean`
- **Default:** `true`

---

## Multi-Account

OpenClaw supports connecting to multiple Chatwoot instances or accounts simultaneously.

### `accounts`

Per-account Chatwoot configurations, keyed by a custom account ID. Each account entry supports all settings from the base config (`baseUrl`, `apiKey`, `accountId`, `webhookSecret`, `dmPolicy`, `allowFrom`, `defaultTo`, `blockStreaming`, `name`, `enabled`).

### `defaultAccount`

Account ID to use as the default when multiple accounts are configured.

```json5
{
  channels: {
    chatwoot: {
      defaultAccount: "production",
      accounts: {
        production: {
          name: "Production Chatwoot",
          baseUrl: "https://chatwoot.yourcompany.com",
          apiKey: "prod-api-key",
          accountId: "1",
          webhookSecret: "prod-secret",
        },
        staging: {
          name: "Staging Chatwoot",
          baseUrl: "https://chatwoot-staging.yourcompany.com",
          apiKey: "staging-api-key",
          accountId: "1",
          webhookSecret: "staging-secret",
        },
      },
    },
  },
}
```

---

## Environment Variables

Connection settings can also be configured via environment variables. These are useful for Docker deployments or CI environments where you do not want secrets in config files.

| Environment Variable      | Maps to         | Description                |
| ------------------------- | --------------- | -------------------------- |
| `CHATWOOT_BASE_URL`       | `baseUrl`       | Chatwoot instance URL      |
| `CHATWOOT_API_KEY`        | `apiKey`        | Agent Bot API access token |
| `CHATWOOT_ACCOUNT_ID`     | `accountId`     | Chatwoot account ID        |
| `CHATWOOT_WEBHOOK_SECRET` | `webhookSecret` | Webhook signature secret   |

Config file values take precedence over environment variables when both are set.

---

## Validation Rules

1. **`dmPolicy` defaults to `"open"`** — Chatwoot manages its own inbox access, so OpenClaw trusts all incoming conversations by default.
2. **`accountId` must be a string** — even though Chatwoot uses numeric IDs, the config accepts it as a string.
3. **`allowFrom` accepts mixed types** — both string (phone numbers) and number (Chatwoot contact IDs) are valid in the same array.
4. **Schema is strict** — unknown properties are rejected. Only the documented fields are accepted.

---

## Full Configuration Examples

### Example 1: Basic Single-Instance Setup

The simplest configuration to connect OpenClaw to a single Chatwoot instance. Suitable for a small team or personal use.

```json5
{
  channels: {
    chatwoot: {
      baseUrl: "https://app.chatwoot.com",
      apiKey: "your-agent-bot-api-key",
      accountId: "1",
      webhookSecret: "your-webhook-secret",
      dmPolicy: "open",
      blockStreaming: true,
    },
  },
}
```

**What this does:**

- Connects to the Chatwoot cloud instance
- Accepts all incoming conversations (Chatwoot manages access)
- Sends complete messages instead of streaming fragments
- Webhook payloads are verified with the shared secret

---

### Example 2: Restricted Access with Allowlist

When you want OpenClaw to only respond to specific contacts, even though Chatwoot routes all conversations to the agent bot.

```json5
{
  channels: {
    chatwoot: {
      baseUrl: "https://chatwoot.yourcompany.com",
      apiKey: "your-agent-bot-api-key",
      accountId: "1",
      webhookSecret: "your-webhook-secret",
      dmPolicy: "allowlist",
      allowFrom: [
        42, // Contact ID: VIP Customer
        108, // Contact ID: Engineering Lead
        "+628123456789", // Phone number: Support Manager
      ],
    },
  },
}
```

**What this does:**

- Only conversations from the three listed contacts get AI responses
- Other conversations are received by Chatwoot but silently ignored by OpenClaw
- Useful for gradual AI rollout — start with a few contacts, then expand

---

### Example 3: Self-Hosted Multi-Account (Production + Staging)

Run two Chatwoot connections from a single OpenClaw gateway, each with independent settings.

```json5
{
  channels: {
    chatwoot: {
      defaultAccount: "prod",
      accounts: {
        prod: {
          name: "Production",
          enabled: true,
          baseUrl: "https://chatwoot.yourcompany.com",
          apiKey: "prod-api-key",
          accountId: "1",
          webhookSecret: "prod-webhook-secret",
          dmPolicy: "open",
          blockStreaming: true,
        },
        staging: {
          name: "Staging",
          enabled: true,
          baseUrl: "https://chatwoot-staging.yourcompany.com",
          apiKey: "staging-api-key",
          accountId: "1",
          webhookSecret: "staging-webhook-secret",
          dmPolicy: "allowlist",
          allowFrom: [1, 2, 3], // QA team contact IDs
          blockStreaming: false,
        },
      },
    },
  },
}
```

**What this does:**

- Production account accepts all conversations with block delivery
- Staging account is restricted to QA team contacts with streaming enabled
- Default account is `prod` — used by CLI commands when no account is specified
- Each account has its own Chatwoot instance, API key, and webhook secret

---

### Example 4: Docker Deployment with Environment Variables

For Docker or containerized deployments where secrets should not be in config files.

**docker-compose.yml:**

```yaml
services:
  openclaw:
    image: openclaw:latest
    environment:
      - CHATWOOT_BASE_URL=https://chatwoot.yourcompany.com
      - CHATWOOT_API_KEY=your-agent-bot-api-key
      - CHATWOOT_ACCOUNT_ID=1
      - CHATWOOT_WEBHOOK_SECRET=your-webhook-secret
    ports:
      - "18789:18789"
```

**openclaw.json (minimal, non-secret settings only):**

```json5
{
  channels: {
    chatwoot: {
      dmPolicy: "open",
      blockStreaming: true,
    },
  },
}
```

**What this does:**

- Connection credentials are injected via environment variables (not stored in config files)
- Non-secret channel behavior settings remain in `openclaw.json`
- Secrets can be managed via Docker secrets, `.env` files, or orchestrator secret stores

---

## Usage Patterns

### Pattern 1: Quick Start — Connect Chatwoot Agent Bot to OpenClaw

**Scenario:** You have a running Chatwoot instance and want to add AI-powered auto-replies via OpenClaw.

**Step 1: Create an Agent Bot in Chatwoot**

1. Log into your Chatwoot dashboard
2. Go to **Settings > Applications > Agent Bot**
3. Create a new agent bot and note the **API access token**
4. Note your **Account ID** from the URL (e.g., `/app/accounts/1/...`)

**Step 2: Configure OpenClaw**

```json5
// openclaw.json
{
  channels: {
    chatwoot: {
      baseUrl: "https://app.chatwoot.com",
      apiKey: "your-agent-bot-access-token",
      accountId: "1",
      webhookSecret: "a-random-secret-string",
      blockStreaming: true,
    },
  },
}
```

**Step 3: Set up the webhook in Chatwoot**

1. Go to **Settings > Integrations > Webhooks** in Chatwoot
2. Add a new webhook:
   - **URL:** `https://your-openclaw-host:18789/chatwoot/webhook`
   - **Events:** `message_created`
3. Set the same `webhookSecret` in both Chatwoot and OpenClaw

**Step 4: Assign the agent bot to an inbox**

1. Go to **Settings > Inboxes** in Chatwoot
2. Select the inbox you want the AI bot to handle
3. Under **Agent Bot**, assign the bot you created in Step 1

**Step 5: Verify**

```bash
openclaw channels status --probe
```

Messages in the assigned inbox will now get AI-powered responses.

---

### Pattern 2: Gradual AI Rollout with Allowlist

**Scenario:** You want to test AI responses with a small group before enabling for all customers.

**Phase 1: Start with internal contacts only**

```json5
{
  channels: {
    chatwoot: {
      baseUrl: "https://chatwoot.yourcompany.com",
      apiKey: "your-api-key",
      accountId: "1",
      webhookSecret: "your-secret",
      dmPolicy: "allowlist",
      allowFrom: [
        10, // Internal test contact
        11, // QA team contact
      ],
    },
  },
}
```

Only contacts with Chatwoot ID 10 and 11 get AI responses. All others are ignored.

**Phase 2: Expand to VIP customers**

```json5
{
  channels: {
    chatwoot: {
      dmPolicy: "allowlist",
      allowFrom: [
        10,
        11, // Internal
        42,
        55,
        78, // VIP customers
        "+628123456789", // Key account manager
      ],
    },
  },
}
```

**Phase 3: Open to everyone**

```json5
{
  channels: {
    chatwoot: {
      dmPolicy: "open",
    },
  },
}
```

Remove `allowFrom` entirely — all conversations are now handled by the AI.

---

### Pattern 3: Temporarily Disable the AI Bot

**Scenario:** You need to pause AI auto-replies during a maintenance window or incident without removing the configuration.

**Option A: Disable at channel level**

```json5
{
  channels: {
    chatwoot: {
      enabled: false,
      // ... rest of config unchanged
    },
  },
}
```

**Option B: Disable DM processing entirely**

```json5
{
  channels: {
    chatwoot: {
      dmPolicy: "disabled",
      // ... rest of config unchanged
    },
  },
}
```

**Option C: Disable a specific account in multi-account setup**

```json5
{
  channels: {
    chatwoot: {
      accounts: {
        prod: {
          enabled: false, // Paused
          // ... rest unchanged
        },
        staging: {
          enabled: true, // Still running
          // ...
        },
      },
    },
  },
}
```

All three options are reversible — just set back to `true` / `"open"` and restart.

---

### Pattern 4: Separate Secrets from Config (Production Best Practice)

**Scenario:** You want to keep credentials out of version-controlled config files.

**Use environment variables for secrets:**

```bash
export CHATWOOT_BASE_URL="https://chatwoot.yourcompany.com"
export CHATWOOT_API_KEY="your-secret-api-key"
export CHATWOOT_ACCOUNT_ID="1"
export CHATWOOT_WEBHOOK_SECRET="your-webhook-secret"
```

**Keep only behavior settings in openclaw.json:**

```json5
{
  channels: {
    chatwoot: {
      dmPolicy: "open",
      blockStreaming: true,
      name: "Customer Support Bot",
    },
  },
}
```

**For Docker Compose with an `.env` file:**

```bash
# .env
CHATWOOT_BASE_URL=https://chatwoot.yourcompany.com
CHATWOOT_API_KEY=your-secret-api-key
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_WEBHOOK_SECRET=your-webhook-secret
```

```yaml
# docker-compose.yml
services:
  openclaw:
    image: openclaw:latest
    env_file: .env
    ports:
      - "18789:18789"
```

This keeps secrets out of `openclaw.json` while still allowing non-secret behavior settings to be version-controlled.

---

## Settings Quick Reference

| Setting          | Type                      | Default  | Scope            | Description                                                |
| ---------------- | ------------------------- | -------- | ---------------- | ---------------------------------------------------------- |
| `baseUrl`        | `string`                  | —        | channel, account | Chatwoot instance URL                                      |
| `apiKey`         | `string`                  | —        | channel, account | Agent Bot API access token                                 |
| `accountId`      | `string`                  | —        | channel, account | Chatwoot account ID                                        |
| `webhookSecret`  | `string`                  | —        | channel, account | Webhook signature verification secret                      |
| `dmPolicy`       | `string` enum             | `"open"` | channel, account | DM access policy (`open`/`pairing`/`allowlist`/`disabled`) |
| `allowFrom`      | `(string \| number)[]`    | —        | channel, account | Allowed sender IDs (contact IDs or phone numbers)          |
| `defaultTo`      | `string`                  | —        | channel, account | Default CLI delivery target                                |
| `blockStreaming` | `boolean`                 | —        | channel, account | Disable streaming, send full responses                     |
| `name`           | `string`                  | —        | channel, account | Display name for CLI/UI                                    |
| `enabled`        | `boolean`                 | `true`   | channel, account | Enable/disable this account                                |
| `accounts`       | `Record<string, Account>` | —        | channel only     | Per-account configurations                                 |
| `defaultAccount` | `string`                  | —        | channel only     | Default account ID for multi-account                       |
