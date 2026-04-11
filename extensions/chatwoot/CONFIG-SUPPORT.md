# Chatwoot Channel Config Support Matrix

This document tracks which config settings are supported by the Chatwoot channel plugin, which are schema-only (not wired to runtime behavior), and which are structurally redundant.

## Supported Configs

| Config                             | Enforcement Layer                       | Description                                                                                                                                      |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `enabled`                          | Account resolution                      | Enables/disables the entire channel                                                                                                              |
| `baseUrl` / `apiKey` / `accountId` | Account resolution                      | Connection credentials for Chatwoot REST API                                                                                                     |
| `webhookSecret`                    | Webhook handler                         | HMAC-SHA256 signature verification (supports both `X-Sapa-*` and `X-Chatwoot-*` headers)                                                         |
| `dmPolicy`                         | Webhook handler (pre-dispatch gate)     | Access policy for DM conversations: `open`, `disabled`, `allowlist`, `pairing`                                                                   |
| `allowFrom`                        | Webhook handler (pre-dispatch gate)     | Sender allowlist for DMs — matches phone number, Chatwoot contact ID, full JID, or `phone_number` field                                          |
| `groupPolicy`                      | Webhook handler (pre-dispatch gate)     | Access policy for group conversations: `open`, `disabled`, `allowlist`                                                                           |
| `groupAllowFrom`                   | Webhook handler (pre-dispatch gate)     | Group allowlist — matches group JID (`@g.us`), Chatwoot group contact ID, or `*` wildcard                                                        |
| `groups[id].requireMention`        | Webhook handler (pre-dispatch gate)     | Per-group mention gate — drops group messages where `@openclaw` is not mentioned. Supports exact group ID, contact ID, and `*` wildcard fallback |
| `messagePrefix`                    | Webhook handler (context building)      | Prepended to inbound message `Body` before AI processing. `RawBody` and `CommandBody` keep the original content                                  |
| `responsePrefix`                   | Dispatch/reply pipeline (auto-resolved) | Prepended to outbound AI replies. Supports `"auto"` (uses agent identity name). Resolved via account → channel → global cascade                  |
| `blockStreaming`                   | Dispatch pipeline (auto-resolved)       | Forces non-streaming reply mode (coalesces the full response before sending)                                                                     |
| `blockStreamingCoalesce`           | Dispatch pipeline (auto-resolved)       | Controls coalescing strategy when streaming is blocked                                                                                           |
| `textChunkLimit`                   | Outbound delivery pipeline              | Max characters per outbound message chunk (default: 10,000)                                                                                      |
| `chunkMode`                        | Outbound delivery pipeline              | Chunking strategy: `"length"` (split by size) or `"newline"` (split on paragraph boundaries)                                                     |
| `markdown`                         | Outbound pipeline (auto-resolved)       | Markdown formatting overrides for outbound messages                                                                                              |
| `contextVisibility`                | Reply pipeline (auto-resolved)          | Controls what supplemental context (tool results, system info) is visible in the conversation                                                    |
| `configWrites`                     | Runtime config system                   | Allows the bot to write config changes (e.g., pairing approval)                                                                                  |
| `defaultTo`                        | Routing/send system                     | Default conversation target for outbound-initiated messages                                                                                      |
| `accounts` / `defaultAccount`      | Account resolution                      | Multi-account support with per-account config overrides                                                                                          |

## Not Supported (Schema-Only)

These have valid config schemas but are **not wired** to runtime behavior.

| Config                               | Reason                                                                                                                                         | Implementation Feasibility                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `debounceMs`                         | Chatwoot uses a webhook model — each message arrives as an independent HTTP POST. No persistent connection or polling loop to batch messages.  | Medium — needs a `Map<conversationId, { timer, messages[] }>` accumulator in the webhook handler |
| `sendReadReceipts`                   | The Chatwoot Agent Bot API doesn't expose a "mark as read" endpoint. Chatwoot's internal `update_last_seen` is dashboard-controlled.           | Blocked — requires Chatwoot/Sapa to add a read-receipt API for Agent Bots                        |
| `reactionLevel` / `ackReaction`      | The Chatwoot Agent Bot API only supports text and attachments. No emoji reaction API exists.                                                   | Blocked — requires Chatwoot/Sapa to add a reactions API for Agent Bots                           |
| `mediaMaxMb`                         | Schema accepts a max file size but webhook handler doesn't check attachment sizes.                                                             | Low effort — check `payload.attachments[].file_size` against the limit                           |
| `historyLimit` / `dmHistoryLimit`    | History context limits are resolved at the session store level. The webhook receives single events without access to a message history buffer. | Medium — needs session store integration to cap context window size                              |
| `dms[id].historyLimit`               | Only field in `DmConfigSchema`. Same session store limitation as above.                                                                        | Same as `historyLimit`                                                                           |
| `groups[id].tools` / `toolsBySender` | `dispatchInboundReplyWithBase` doesn't accept tool policy override parameters. Other channels use custom dispatcher pipelines.                 | Blocked — requires Plugin SDK extension to pass per-entity tool overrides through dispatch       |
| `heartbeat` / `healthMonitor`        | Infrastructure-level monitoring outside the message flow. Needs a periodic timer task in the plugin lifecycle.                                 | Medium — needs plugin lifecycle timer that pings the Chatwoot API                                |
| `actions`                            | Controls bot capabilities (reactions, polls, sendMessage). Reactions and polls aren't supported by Agent Bot API.                              | Partial — `sendMessage: false` could disable outbound replies                                    |

## Structurally Redundant

These configs exist in the schema but are **not needed** due to the webhook architecture.

| Config         | Reason                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `selfChatMode` | Already handled — `isIncomingMessageType()` filters out outgoing messages (`message_type: 1`, `sender_type: "AgentBot"`). Echo loops are impossible by design. |
| `capabilities` | Informational tags only — no runtime wiring needed.                                                                                                            |

## Quick Reference

| Config                                      | Status                                        |
| ------------------------------------------- | --------------------------------------------- |
| `enabled`                                   | ✅ Supported                                  |
| `baseUrl` / `apiKey` / `accountId`          | ✅ Supported                                  |
| `webhookSecret`                             | ✅ Supported                                  |
| `dmPolicy` / `allowFrom`                    | ✅ Supported                                  |
| `groupPolicy` / `groupAllowFrom`            | ✅ Supported                                  |
| `groups[id].requireMention`                 | ✅ Supported                                  |
| `messagePrefix`                             | ✅ Supported                                  |
| `responsePrefix`                            | ✅ Supported (auto-resolved)                  |
| `blockStreaming` / `blockStreamingCoalesce` | ✅ Supported (auto-resolved)                  |
| `textChunkLimit` / `chunkMode`              | ✅ Supported                                  |
| `markdown`                                  | ✅ Supported (auto-resolved)                  |
| `contextVisibility`                         | ✅ Supported (auto-resolved)                  |
| `configWrites`                              | ✅ Supported                                  |
| `defaultTo`                                 | ✅ Supported                                  |
| `accounts` / `defaultAccount`               | ✅ Supported                                  |
| `debounceMs`                                | ❌ Not wired (needs accumulator)              |
| `sendReadReceipts`                          | ❌ Not wired (no Chatwoot API)                |
| `reactionLevel` / `ackReaction`             | ❌ Not wired (no Chatwoot API)                |
| `selfChatMode`                              | ⚪ Redundant (handled by message_type filter) |
| `mediaMaxMb`                                | ❌ Not wired (easy to add)                    |
| `historyLimit` / `dmHistoryLimit`           | ❌ Not wired (session store level)            |
| `dms[id].historyLimit`                      | ❌ Not wired (session store level)            |
| `groups[id].tools` / `toolsBySender`        | ❌ Not wired (needs SDK extension)            |
| `heartbeat` / `healthMonitor`               | ❌ Not wired (needs lifecycle timer)          |
| `capabilities`                              | ⚪ Informational only                         |
| `actions`                                   | ❌ Not wired                                  |

**Legend:** ✅ = working, ❌ = schema exists but not enforced, ⚪ = intentionally not needed
