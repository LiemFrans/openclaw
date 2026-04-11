# Chatwoot vs WhatsApp Channel Configuration Comparison

Side-by-side comparison of all configuration settings available in the Chatwoot and WhatsApp channels in OpenClaw.

---

## Connection and Authentication

| Setting          | Chatwoot                                                                                  | WhatsApp                                |
| ---------------- | ----------------------------------------------------------------------------------------- | --------------------------------------- |
| `baseUrl`        | Chatwoot instance URL                                                                     | —                                       |
| `apiKey`         | Agent Bot API access token                                                                | —                                       |
| `accountId`      | Chatwoot account ID (string)                                                              | —                                       |
| `webhookSecret`  | Webhook signature verification secret                                                     | —                                       |
| `authDir`        | —                                                                                         | Baileys multi-file auth state directory |
| Environment vars | `CHATWOOT_BASE_URL`, `CHATWOOT_API_KEY`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_WEBHOOK_SECRET` | — (pairing via QR code)                 |

**Key difference:** Chatwoot connects via REST API + webhook. WhatsApp connects via Baileys (WhatsApp Web protocol) with QR code pairing and local credential storage.

---

## Access Control

| Setting             | Chatwoot                               | WhatsApp                               |
| ------------------- | -------------------------------------- | -------------------------------------- |
| `dmPolicy`          | `"open"` (default)                     | `"pairing"` (default)                  |
| `allowFrom`         | Contact IDs (number) or phone (string) | E.164 phone numbers (string)           |
| `defaultTo`         | String                                 | E.164 or group JID                     |
| `selfChatMode`      | Bot on own identity safeguards         | Bot on personal number safeguards      |
| `groupPolicy`       | `"allowlist"` (default)                | `"allowlist"` (default)                |
| `groupAllowFrom`    | Contact IDs or phone numbers           | E.164 phone numbers for group senders  |
| `groups`            | Per-group config (mention, tools)      | Per-group config (mention, tools)      |
| `contextVisibility` | Supplemental context visibility policy | Supplemental context visibility policy |

**Key difference:** Chatwoot defaults to `"open"` because Chatwoot itself manages inbox access. WhatsApp defaults to `"pairing"` because the bot directly receives messages from any phone number. Both channels now support group chat configuration, though Chatwoot group semantics depend on the Chatwoot instance's conversation model.

---

## Message Delivery

| Setting                  | Chatwoot                                    | WhatsApp                                    |
| ------------------------ | ------------------------------------------- | ------------------------------------------- |
| `blockStreaming`         | Yes                                         | Yes                                         |
| `blockStreamingCoalesce` | Merge streamed block replies before sending | Merge streamed block replies before sending |
| `textChunkLimit`         | Max chars per chunk                         | Max chars per chunk (default: 4000)         |
| `chunkMode`              | `"length"` or `"newline"`                   | `"length"` or `"newline"`                   |
| `debounceMs`             | Batch rapid messages (default: 0)           | Batch rapid messages (default: 0)           |
| `sendReadReceipts`       | Send read receipts                          | Send read receipts (default: true)          |
| `messagePrefix`          | Inbound message prefix override             | Inbound message prefix override             |
| `responsePrefix`         | Outbound response prefix override           | Outbound response prefix override           |

**Key difference:** Both channels now support the same delivery controls. In practice, Chatwoot delivers messages via REST API, so chunking and debounce behavior may differ slightly from WhatsApp's persistent WebSocket delivery.

---

## Reactions

| Setting         | Chatwoot                                            | WhatsApp                                            |
| --------------- | --------------------------------------------------- | --------------------------------------------------- |
| `reactionLevel` | `"off"` / `"ack"` / `"minimal"` / `"extensive"`     | `"off"` / `"ack"` / `"minimal"` / `"extensive"`     |
| `ackReaction`   | Emoji, direct (bool), group (always/mentions/never) | Emoji, direct (bool), group (always/mentions/never) |

**Key difference:** Both channels now support the same reaction configuration. Actual reaction delivery depends on the platform's capabilities — Chatwoot may not render emoji reactions the same way as WhatsApp native reactions.

---

## Media

| Setting      | Chatwoot                                | WhatsApp                                |
| ------------ | --------------------------------------- | --------------------------------------- |
| `mediaMaxMb` | Max media file size in MB (default: 50) | Max media file size in MB (default: 50) |

**Key difference:** Both channels enforce the same media size limit configuration. Actual upload handling is managed by each platform's backend.

---

## Session and History

| Setting          | Chatwoot                                   | WhatsApp                                              |
| ---------------- | ------------------------------------------ | ----------------------------------------------------- |
| `historyLimit`   | Max group messages buffered for context    | Max group messages buffered for context (default: 50) |
| `dmHistoryLimit` | Max DM turns for history context           | Max DM turns for history context                      |
| `dms`            | Per-DM config overrides (keyed by user ID) | Per-DM config overrides (keyed by user ID)            |

**Key difference:** Both channels support the same history and per-DM configuration model. Chatwoot conversation history is also accessible via the Chatwoot API for additional context.

---

## Multi-Account

| Setting          | Chatwoot                       | WhatsApp                       |
| ---------------- | ------------------------------ | ------------------------------ |
| `accounts`       | Per-account configs            | Per-account configs            |
| `defaultAccount` | Default account ID             | Default account ID             |
| `name`           | Display name                   | Display name                   |
| `enabled`        | Enable/disable (default: true) | Enable/disable (default: true) |

**Key difference:** Both channels support multi-account. Each Chatwoot account connects to a different Chatwoot instance/account. Each WhatsApp account connects to a different phone number via Baileys.

---

## Actions and Tools

| Setting               | Chatwoot | WhatsApp                                      |
| --------------------- | -------- | --------------------------------------------- |
| `actions.reactions`   | —        | Allow agent to send reactions                 |
| `actions.sendMessage` | —        | Allow agent to send messages                  |
| `actions.polls`       | —        | Allow agent to create polls                   |
| `configWrites`        | —        | Allow config writes from chat (default: true) |

**Key difference:** WhatsApp has granular tool/action gating. Chatwoot does not expose per-action gating because outbound actions go through Chatwoot's API which has its own permission model.

---

## Advanced / Operational

| Setting         | Chatwoot | WhatsApp                               |
| --------------- | -------- | -------------------------------------- |
| `capabilities`  | —        | Provider capability tags               |
| `markdown`      | —        | Markdown formatting overrides (tables) |
| `heartbeat`     | —        | Heartbeat visibility settings          |
| `healthMonitor` | —        | Channel health monitor overrides       |

**Key difference:** WhatsApp channel runs a persistent WebSocket connection (Baileys) with heartbeat and health monitoring. Chatwoot uses a stateless webhook model — health is determined by Chatwoot API reachability.

---

## Summary Table

| Category             | Chatwoot Settings | WhatsApp Settings |
| -------------------- | :---------------: | :---------------: |
| Connection/Auth      |         4         |    1 (authDir)    |
| Access Control       |         8         |         7         |
| Message Delivery     |         8         |         8         |
| Reactions            |         2         |         2         |
| Media                |         1         |         1         |
| Session/History      |         3         |         3         |
| Multi-Account        |         4         |         4         |
| Actions/Tools        |         0         |         4         |
| Advanced/Operational |         0         |         4         |
| **Total unique**     |      **30**       |      **34**       |

---

## When to Use Which

| Scenario                                       | Recommended Channel                   |
| ---------------------------------------------- | ------------------------------------- |
| Customer support with team agents + AI bot     | **Chatwoot**                          |
| Personal AI assistant on your phone            | **WhatsApp**                          |
| Multi-channel inbox (email, web, social + AI)  | **Chatwoot**                          |
| Group chat AI interactions                     | **WhatsApp**                          |
| Need emoji reactions and rich media control    | **WhatsApp**                          |
| Need agent handoff and conversation assignment | **Chatwoot**                          |
| Quick setup with minimal config                | **Chatwoot** (4 settings)             |
| Fine-grained delivery control                  | **WhatsApp**                          |
| Docker/cloud deployment with env var secrets   | **Chatwoot** (native env var support) |
