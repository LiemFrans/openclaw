# WhatsApp Channel Configuration Reference

Complete reference for all `channels.whatsapp` configuration settings in OpenClaw, with examples and usage patterns.

All settings live under the `channels.whatsapp` key in `openclaw.json` (JSON5 format).

---

## Table of Contents

- [Access Control](#access-control)
- [Group Settings](#group-settings)
- [Message Delivery](#message-delivery)
- [Reactions](#reactions)
- [Media](#media)
- [Multi-Account](#multi-account)
- [Actions and Tools](#actions-and-tools)
- [Session and History](#session-and-history)
- [Advanced Settings](#advanced-settings)
- [Validation Rules](#validation-rules)
- [Full Configuration Examples](#full-configuration-examples)
- [Usage Patterns](#usage-patterns)

---

## Access Control

### `dmPolicy`

Controls who can send direct messages to the bot.

| Value         | Description                                                    | Default |
| ------------- | -------------------------------------------------------------- | ------- |
| `"pairing"`   | Only paired users can chat (pairing via `/pair` or onboarding) | **Yes** |
| `"allowlist"` | Only users in `allowFrom` can chat                             |         |
| `"open"`      | Anyone can chat (requires `allowFrom: ["*"]`)                  |         |
| `"disabled"`  | Block all direct messages                                      |         |

### `allowFrom`

Array of E.164 phone numbers allowed to send direct messages. Numbers are normalized internally (leading `+` is optional).

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: ["+15551234567", "+628123456789"],
    },
  },
}
```

Special value: `"*"` allows everyone (required when `dmPolicy` is `"open"`).

### `selfChatMode`

Enable when the bot uses your personal WhatsApp number (same phone). Activates self-chat safeguards:

- Skips read receipts for self-chat turns
- Ignores mention-JID auto-trigger that would ping yourself
- Adds a default `responsePrefix` like `[openclaw]` if none is set

```json5
{
  channels: {
    whatsapp: {
      selfChatMode: true,
      dmPolicy: "allowlist",
      allowFrom: ["+15551234567"], // your own number
    },
  },
}
```

### `defaultTo`

Default delivery target for CLI `--deliver` when no explicit `--reply-to` is provided. Accepts E.164 phone number or group JID.

```json5
{
  channels: {
    whatsapp: {
      defaultTo: "+15551234567",
    },
  },
}
```

---

## Group Settings

### `groupPolicy`

Controls how group messages are handled.

| Value         | Description                                                     | Default |
| ------------- | --------------------------------------------------------------- | ------- |
| `"open"`      | All group senders bypass allowlist; only mention-gating applies |         |
| `"allowlist"` | Only senders in `groupAllowFrom` (or `allowFrom`) are allowed   | **Yes** |
| `"disabled"`  | Block all group messages entirely                               |         |

### `groupAllowFrom`

Array of E.164 phone numbers allowed to trigger the bot in groups. Falls back to `allowFrom` if not set.

```json5
{
  channels: {
    whatsapp: {
      groupPolicy: "allowlist",
      groupAllowFrom: ["+15551234567", "+628123456789"],
    },
  },
}
```

### `groups`

Per-group configuration overrides, keyed by group JID. When present, acts as a group allowlist — only listed groups are eligible. Use `"*"` as a key to set defaults for all groups.

```json5
{
  channels: {
    whatsapp: {
      groups: {
        // Allow all groups with default settings
        "*": {},
        // Override settings for a specific group
        "120363012345678901@g.us": {
          requireMention: false,
          tools: {
            allow: ["web_search", "calculator"],
          },
        },
      },
    },
  },
}
```

Each group entry supports:

| Field            | Type    | Description                                          |
| ---------------- | ------- | ---------------------------------------------------- |
| `requireMention` | boolean | Override mention requirement for this group          |
| `tools`          | object  | Tool allow/deny policy for this group                |
| `toolsBySender`  | object  | Per-sender tool policy overrides (keyed by phone/ID) |

---

## Message Delivery

### `textChunkLimit`

Maximum character count per outbound message chunk. Long replies are automatically split.

- **Default:** `4000`
- **Type:** positive integer

### `chunkMode`

How long messages are split into chunks.

| Value       | Description                                                         | Default |
| ----------- | ------------------------------------------------------------------- | ------- |
| `"length"`  | Split by character count at `textChunkLimit`                        | **Yes** |
| `"newline"` | Split at paragraph boundaries (blank lines), then fall back to size |         |

### `sendReadReceipts`

Send read receipts for incoming messages.

- **Default:** `true`
- Self-chat turns always skip read receipts regardless of this setting.

### `messagePrefix`

Prefix prepended to all inbound WhatsApp messages before they reach the agent.

```json5
{
  channels: {
    whatsapp: {
      messagePrefix: "[WhatsApp]",
    },
  },
}
```

### `responsePrefix`

Prefix prepended to all outbound replies. Useful for distinguishing bot responses.

```json5
{
  channels: {
    whatsapp: {
      responsePrefix: "[Bot]",
    },
  },
}
```

### `debounceMs`

Debounce window in milliseconds for batching rapid consecutive messages from the same sender. The system waits this long before processing, combining multiple quick messages into one.

- **Default:** `0` (disabled)
- **Type:** non-negative integer

```json5
{
  channels: {
    whatsapp: {
      debounceMs: 2000, // Wait 2 seconds to batch rapid messages
    },
  },
}
```

### `blockStreaming`

Disable streaming/block delivery for this channel. When `true`, the full response is sent as a single message instead of being streamed in blocks.

### `blockStreamingCoalesce`

Controls how streamed block replies are merged before sending.

---

## Reactions

### `reactionLevel`

Controls how broadly the agent uses emoji reactions.

| Level         | Ack Reactions | Agent Reactions    | Description                                      |
| ------------- | ------------- | ------------------ | ------------------------------------------------ |
| `"off"`       | No            | No                 | No reactions at all                              |
| `"ack"`       | Yes           | No                 | Ack reactions only (pre-reply receipt)           |
| `"minimal"`   | Yes           | Yes (conservative) | Ack + agent reactions with conservative guidance |
| `"extensive"` | Yes           | Yes (encouraged)   | Ack + agent reactions with encouraged guidance   |

- **Default:** `"minimal"`

### `ackReaction`

Immediate acknowledgment reaction sent when a message is received (before the reply is generated).

| Field    | Type                                    | Default      | Description                            |
| -------- | --------------------------------------- | ------------ | -------------------------------------- |
| `emoji`  | string                                  | `"👀"`       | Emoji to react with. Empty = disabled. |
| `direct` | boolean                                 | `true`       | Send ack reaction in direct chats      |
| `group`  | `"always"` \| `"mentions"` \| `"never"` | `"mentions"` | When to send ack reaction in groups    |

```json5
{
  channels: {
    whatsapp: {
      ackReaction: {
        emoji: "⏳",
        direct: true,
        group: "always",
      },
    },
  },
}
```

---

## Media

### `mediaMaxMb`

Maximum media file size in megabytes for both inbound saving and outbound sending.

- **Default:** `50`
- **Type:** positive integer
- Images are auto-optimized (resize/quality sweep) to fit within limits.
- On send failure, a text fallback warning is sent instead of silently dropping.

```json5
{
  channels: {
    whatsapp: {
      mediaMaxMb: 25, // Lower limit for constrained environments
    },
  },
}
```

---

## Multi-Account

### `accounts`

Per-account WhatsApp configurations, keyed by account ID. Each account can override any channel-level setting.

Each account supports all settings from the shared config, plus:

| Field     | Type    | Default | Description                                      |
| --------- | ------- | ------- | ------------------------------------------------ |
| `name`    | string  | —       | Display name for CLI/UI lists                    |
| `enabled` | boolean | `true`  | Set `false` to disable this account              |
| `authDir` | string  | —       | Override Baileys multi-file auth state directory |

### `defaultAccount`

Account ID to use as the default when multiple accounts are configured. If not set, `"default"` is used if it exists, otherwise the first account ID (sorted alphabetically).

```json5
{
  channels: {
    whatsapp: {
      defaultAccount: "work",
      accounts: {
        work: {
          name: "Work Bot",
          dmPolicy: "allowlist",
          allowFrom: ["+15551234567"],
        },
        personal: {
          name: "Personal",
          selfChatMode: true,
          dmPolicy: "allowlist",
          allowFrom: ["+15559876543"],
        },
      },
    },
  },
}
```

Settings inheritance: account-level settings override channel-level defaults. For `dmPolicy` and `allowFrom`, each account resolves its effective policy from its own setting first, falling back to the channel-level setting.

---

## Actions and Tools

### `actions`

Per-action tool gating. All actions default to `true`.

| Field         | Type    | Description                       |
| ------------- | ------- | --------------------------------- |
| `reactions`   | boolean | Allow the agent to send reactions |
| `sendMessage` | boolean | Allow the agent to send messages  |
| `polls`       | boolean | Allow the agent to create polls   |

```json5
{
  channels: {
    whatsapp: {
      actions: {
        reactions: true,
        sendMessage: true,
        polls: false, // Disable poll creation
      },
    },
  },
}
```

### `configWrites`

Allow channel-initiated config writes (e.g., the agent updating its own configuration through conversation commands).

- **Default:** `true`
- Set to `false` to lock down configuration changes from the chat interface.

---

## Session and History

### `historyLimit`

Maximum number of unprocessed group messages to buffer and inject as context when the bot is triggered.

- **Default:** `50` (runtime fallback)
- **Type:** non-negative integer (0 disables)
- Falls back to `messages.groupChat.historyLimit` if not set.

### `dmHistoryLimit`

Maximum number of DM turns to keep as history context.

- **Type:** non-negative integer

### `dms`

Per-DM configuration overrides, keyed by user ID (phone number or JID).

```json5
{
  channels: {
    whatsapp: {
      dms: {
        "+15551234567": {
          historyLimit: 100,
        },
      },
    },
  },
}
```

### `contextVisibility`

Controls supplemental context visibility policy.

| Value               | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `"all"`             | Full context visible                                          |
| `"allowlist"`       | Context limited to allowlisted users                          |
| `"allowlist_quote"` | Context limited to allowlisted users including quoted context |

---

## Advanced Settings

### `enabled`

Enable or disable the entire WhatsApp channel.

- **Default:** `true` (when a `channels.whatsapp` block exists)

### `capabilities`

Array of provider capability tags used for agent/runtime guidance.

```json5
{
  channels: {
    whatsapp: {
      capabilities: ["voice", "media"],
    },
  },
}
```

### `markdown`

Markdown formatting overrides (e.g., table rendering behavior).

### `heartbeat`

Heartbeat visibility settings for the channel health indicator.

### `healthMonitor`

Channel health monitor configuration overrides.

---

## Validation Rules

OpenClaw enforces the following validation rules at config load time:

1. **`dmPolicy: "open"` requires `allowFrom: ["*"]`**
   - You cannot set open DM policy without explicitly allowing all senders.

2. **`dmPolicy: "allowlist"` requires non-empty `allowFrom`**
   - An allowlist policy with no senders listed is a validation error.

3. **Per-account validation inherits from channel level**
   - If an account sets `dmPolicy: "open"` but has no `allowFrom`, the channel-level `allowFrom` is checked. If neither includes `"*"`, validation fails.
   - Same inheritance applies for `dmPolicy: "allowlist"`.

4. **`debounceMs` must be a non-negative integer** (0 = disabled).

5. **`mediaMaxMb` must be a positive integer**.

6. **`historyLimit` must be a non-negative integer** (0 = disabled).

---

## Full Configuration Examples

### Example 1: Minimal Personal Bot

A simple setup for a personal assistant on your own WhatsApp number.

```json5
{
  channels: {
    whatsapp: {
      // Access control
      selfChatMode: true,
      dmPolicy: "allowlist",
      allowFrom: ["+15551234567"], // Your own number

      // Reactions
      ackReaction: {
        emoji: "👀",
        direct: true,
        group: "never",
      },
      reactionLevel: "minimal",

      // Delivery
      sendReadReceipts: true,
      textChunkLimit: 4000,
    },
  },
}
```

**What this does:**

- Enables self-chat mode (bot runs on your personal number)
- Only you can chat with the bot via DM
- Ack reaction (👀) shown when a message is received in DM
- No ack reactions in groups
- Read receipts are sent
- Messages longer than 4000 characters are split into chunks

---

### Example 2: Team Bot with Group Support

A dedicated WhatsApp number serving a small team with group chat integration.

```json5
{
  channels: {
    whatsapp: {
      // Access control
      dmPolicy: "allowlist",
      allowFrom: [
        "+15551234567", // Alice
        "+15559876543", // Bob
        "+628123456789", // Charlie
      ],

      // Group settings
      groupPolicy: "allowlist",
      groupAllowFrom: [
        "+15551234567", // Alice
        "+15559876543", // Bob
      ],
      groups: {
        "120363012345678901@g.us": {
          requireMention: true,
          tools: {
            allow: ["web_search", "calculator"],
          },
        },
        "120363098765432109@g.us": {
          requireMention: false, // Always listening in this group
        },
      },

      // History
      historyLimit: 30,

      // Reactions
      reactionLevel: "minimal",
      ackReaction: {
        emoji: "⏳",
        direct: true,
        group: "mentions",
      },

      // Delivery
      textChunkLimit: 3000,
      chunkMode: "newline",
      debounceMs: 1500,
      sendReadReceipts: true,

      // Media
      mediaMaxMb: 25,

      // Actions
      actions: {
        reactions: true,
        sendMessage: true,
        polls: true,
      },
    },
  },
}
```

**What this does:**

- Three users can DM the bot; only Alice and Bob can trigger it in groups
- Two specific groups are whitelisted with custom settings
- First group requires @mention; second group responds to all messages
- Per-group tool restrictions (only search and calculator in the first group)
- 30-message group history context
- Debounce of 1.5 seconds batches rapid messages
- Splits replies at paragraph boundaries (newline mode)
- Media capped at 25 MB

---

### Example 3: Open Community Bot

An open bot that anyone can message, with group support.

```json5
{
  channels: {
    whatsapp: {
      // Open access
      dmPolicy: "open",
      allowFrom: ["*"],

      // Open groups
      groupPolicy: "open",
      groups: {
        "*": {
          requireMention: true,
        },
      },

      // Conservative reactions
      reactionLevel: "ack",
      ackReaction: {
        emoji: "✅",
        direct: true,
        group: "always",
      },

      // Delivery
      textChunkLimit: 2000,
      chunkMode: "newline",
      sendReadReceipts: false,

      // Disable config writes for security
      configWrites: false,

      // Actions
      actions: {
        reactions: true,
        sendMessage: true,
        polls: false,
      },
    },
  },
}
```

**What this does:**

- Anyone can DM or message in groups
- All groups are eligible, but bot requires @mention in every group
- Ack-only reactions (no agent-initiated reactions)
- Shorter chunk limit (2000 chars) for readability
- Read receipts disabled (high traffic)
- Config writes disabled — nobody can change settings via chat
- Polls disabled

---

### Example 4: Multi-Account Enterprise Setup

Two WhatsApp accounts on a single gateway: one for customer support, one for internal.

```json5
{
  channels: {
    whatsapp: {
      // Channel-level defaults
      defaultAccount: "support",
      dmPolicy: "allowlist",
      sendReadReceipts: true,
      reactionLevel: "minimal",
      textChunkLimit: 4000,
      mediaMaxMb: 50,

      accounts: {
        support: {
          name: "Customer Support",
          enabled: true,
          dmPolicy: "open",
          allowFrom: ["*"],
          groupPolicy: "disabled",
          ackReaction: {
            emoji: "👋",
            direct: true,
            group: "never",
          },
          reactionLevel: "ack",
          sendReadReceipts: true,
          configWrites: false,
          responsePrefix: "[Support Bot]",
        },
        internal: {
          name: "Internal Assistant",
          enabled: true,
          dmPolicy: "allowlist",
          allowFrom: [
            "+15551111111", // Engineering lead
            "+15552222222", // Product lead
            "+15553333333", // Operations
          ],
          groupPolicy: "allowlist",
          groupAllowFrom: ["+15551111111", "+15552222222"],
          groups: {
            "120363012345678901@g.us": {
              requireMention: true,
            },
          },
          ackReaction: {
            emoji: "🔍",
            direct: true,
            group: "mentions",
          },
          historyLimit: 50,
          debounceMs: 2000,
          mediaMaxMb: 100,
        },
      },

      // Shared actions
      actions: {
        reactions: true,
        sendMessage: true,
        polls: true,
      },
    },
  },
}
```

**What this does:**

- `support` account: open to all customers, DM only, no groups, short ack reaction, locked config
- `internal` account: restricted to 3 team members, one group enabled, higher media limit, debounce
- Each account has independent access policies, reaction settings, and delivery behavior
- Default account is `support` — used by CLI `--deliver` when no account is specified

---

## Usage Patterns

### Pattern 1: Restrict DM Access to Specific People

**Scenario:** You want only your family members to be able to chat with the bot.

```json5
{
  channels: {
    whatsapp: {
      dmPolicy: "allowlist",
      allowFrom: [
        "+15551234567", // Mom
        "+15559876543", // Dad
        "+15551112222", // Sibling
      ],
    },
  },
}
```

**How it works:**

1. Set `dmPolicy` to `"allowlist"` — only listed numbers can initiate DMs.
2. Add each authorized number to `allowFrom` in E.164 format.
3. Anyone not in the list who messages the bot will be silently ignored.
4. Numbers are normalized internally, so `+1555-123-4567` and `15551234567` are equivalent.

**To update the allowlist:** Edit `openclaw.json` and restart, or use `openclaw config set channels.whatsapp.allowFrom '["+15551234567","+15559999999"]'` from the CLI.

---

### Pattern 2: Enable Group Chat with Mention-Only Activation

**Scenario:** The bot should respond in specific WhatsApp groups, but only when explicitly mentioned.

```json5
{
  channels: {
    whatsapp: {
      groupPolicy: "allowlist",
      groupAllowFrom: ["+15551234567", "+15559876543"],
      groups: {
        "120363012345678901@g.us": {
          requireMention: true,
        },
        "120363098765432109@g.us": {
          requireMention: true,
        },
      },
      historyLimit: 30,
      ackReaction: {
        emoji: "👀",
        direct: true,
        group: "mentions",
      },
    },
  },
}
```

**How it works:**

1. `groupPolicy: "allowlist"` ensures only authorized senders trigger the bot.
2. `groupAllowFrom` lists who can trigger the bot in any group.
3. The `groups` map whitelists specific groups and requires @mention in each.
4. When triggered, the bot receives up to 30 previous messages as context (`historyLimit`).
5. Ack reaction (👀) is only shown when the bot is mentioned in a group.

**Finding group JIDs:** Check gateway logs when a group message arrives — the JID appears in the log line (format: `<numbers>@g.us`).

---

### Pattern 3: Batch Rapid Messages with Debounce

**Scenario:** Users send multiple short messages in quick succession. You want to batch them into a single request.

```json5
{
  channels: {
    whatsapp: {
      debounceMs: 3000,
      ackReaction: {
        emoji: "⏳",
        direct: true,
        group: "mentions",
      },
    },
  },
}
```

**How it works:**

1. When a message arrives, the system waits 3 seconds before processing.
2. If more messages arrive from the same sender within the window, they are combined.
3. The ⏳ reaction signals "I'm waiting for more input."
4. After the window expires, all batched messages are sent to the agent as one request.

**Recommended values:**

- `1000`–`2000` ms: Light batching for normal conversation
- `3000`–`5000` ms: Heavy batching for users who type in fragments
- `0`: No batching (default) — each message processed immediately

---

### Pattern 4: Control Reaction Behavior

**Scenario:** You want fine-grained control over when and how the bot uses emoji reactions.

**Case A: Ack reaction only, no agent reactions**

```json5
{
  channels: {
    whatsapp: {
      reactionLevel: "ack",
      ackReaction: {
        emoji: "✅",
        direct: true,
        group: "always",
      },
    },
  },
}
```

The bot sends ✅ immediately upon receiving a message (acknowledgment), but never adds expressive reactions to messages.

**Case B: No reactions at all**

```json5
{
  channels: {
    whatsapp: {
      reactionLevel: "off",
    },
  },
}
```

All reactions are suppressed — both ack and agent-initiated. The `ackReaction` config is ignored when `reactionLevel` is `"off"`.

**Case C: Encourage liberal agent reactions**

```json5
{
  channels: {
    whatsapp: {
      reactionLevel: "extensive",
      ackReaction: {
        emoji: "👀",
        direct: true,
        group: "mentions",
      },
    },
  },
}
```

The agent is encouraged to react to messages expressively (😂, 👍, ❤️, etc.) in addition to the ack reaction.

---

### Pattern 5: Customize Message Chunking

**Scenario:** Your bot produces long responses that need to be split readable on mobile screens.

**Case A: Split at paragraph boundaries**

```json5
{
  channels: {
    whatsapp: {
      textChunkLimit: 3000,
      chunkMode: "newline",
    },
  },
}
```

Messages are split at blank lines (paragraph boundaries) when possible, falling back to length-based splitting at 3000 characters.

**Case B: Strict length-based splitting**

```json5
{
  channels: {
    whatsapp: {
      textChunkLimit: 2000,
      chunkMode: "length",
    },
  },
}
```

Messages are split strictly at 2000 characters regardless of content structure.

---

### Pattern 6: Per-Group Tool Restrictions

**Scenario:** Different groups need different tool access. A public group should only have basic tools, while a private team group gets full access.

```json5
{
  channels: {
    whatsapp: {
      groupPolicy: "open",
      groups: {
        // Public community group: limited tools
        "120363012345678901@g.us": {
          requireMention: true,
          tools: {
            allow: ["web_search"],
            deny: ["file_write", "shell_exec"],
          },
        },
        // Private team group: allow specific tools per sender
        "120363098765432109@g.us": {
          requireMention: false,
          tools: {
            allow: ["web_search", "calculator", "file_read"],
          },
          toolsBySender: {
            "+15551234567": {
              allow: ["*"], // Team lead gets all tools
            },
          },
        },
      },
    },
  },
}
```

**How it works:**

1. `tools.allow` / `tools.deny` set the default tool policy for that group.
2. `toolsBySender` overrides the default for specific phone numbers.
3. The team lead (`+15551234567`) gets unrestricted tool access in the private group.

---

### Pattern 7: Self-Chat Mode on Personal Number

**Scenario:** You are using your personal WhatsApp number and want to chat with the bot by messaging yourself.

```json5
{
  channels: {
    whatsapp: {
      selfChatMode: true,
      dmPolicy: "allowlist",
      allowFrom: ["+15551234567"], // Your own number
      responsePrefix: "[AI]",
      sendReadReceipts: false,
    },
  },
}
```

**How it works:**

1. `selfChatMode: true` enables self-chat safeguards.
2. Your own number in `allowFrom` grants DM access.
3. Read receipts are disabled to avoid confusion (your phone already marks messages as read).
4. `responsePrefix: "[AI]"` marks bot replies so you can distinguish them from your own messages.

---

## Settings Quick Reference

| Setting                  | Type                     | Default        | Scope            |
| ------------------------ | ------------------------ | -------------- | ---------------- |
| `enabled`                | boolean                  | `true`         | channel, account |
| `dmPolicy`               | string enum              | `"pairing"`    | channel, account |
| `allowFrom`              | string[]                 | —              | channel, account |
| `selfChatMode`           | boolean                  | —              | channel, account |
| `defaultTo`              | string                   | —              | channel, account |
| `groupPolicy`            | string enum              | `"allowlist"`  | channel, account |
| `groupAllowFrom`         | string[]                 | —              | channel, account |
| `groups`                 | Record                   | —              | channel, account |
| `historyLimit`           | number (>= 0)            | `50` (runtime) | channel, account |
| `dmHistoryLimit`         | number (>= 0)            | —              | channel, account |
| `dms`                    | Record                   | —              | channel, account |
| `textChunkLimit`         | number (> 0)             | `4000`         | channel, account |
| `chunkMode`              | `"length"` / `"newline"` | `"length"`     | channel, account |
| `mediaMaxMb`             | number (> 0)             | `50`           | channel, account |
| `debounceMs`             | number (>= 0)            | `0`            | channel, account |
| `blockStreaming`         | boolean                  | —              | channel, account |
| `blockStreamingCoalesce` | object                   | —              | channel, account |
| `sendReadReceipts`       | boolean                  | `true`         | channel, account |
| `messagePrefix`          | string                   | —              | channel, account |
| `responsePrefix`         | string                   | —              | channel, account |
| `ackReaction`            | object                   | see below      | channel, account |
| `reactionLevel`          | string enum              | `"minimal"`    | channel, account |
| `contextVisibility`      | string enum              | —              | channel, account |
| `capabilities`           | string[]                 | —              | channel, account |
| `markdown`               | object                   | —              | channel, account |
| `configWrites`           | boolean                  | `true`         | channel, account |
| `heartbeat`              | object                   | —              | channel, account |
| `healthMonitor`          | object                   | —              | channel, account |
| `accounts`               | Record                   | —              | channel only     |
| `defaultAccount`         | string                   | —              | channel only     |
| `actions`                | object                   | all `true`     | channel only     |

**`ackReaction` defaults:** `emoji: "👀"`, `direct: true`, `group: "mentions"`
