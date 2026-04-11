import type {
  DmPolicy,
  GroupPolicy,
  ContextVisibilityMode,
  BlockStreamingCoalesceConfig,
  OpenClawConfig,
  BaseProbeResult,
} from "./runtime-api.js";

export type ChatwootGroupConfig = {
  requireMention?: boolean;
  tools?: { allow?: string[]; alsoAllow?: string[]; deny?: string[] };
  toolsBySender?: Record<string, { allow?: string[]; alsoAllow?: string[]; deny?: string[] }>;
};

export type ChatwootAccountConfig = {
  name?: string;
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  accountId?: string;
  webhookSecret?: string;
  dmPolicy?: DmPolicy;
  allowFrom?: Array<string | number>;
  defaultTo?: string;
  blockStreaming?: boolean;
  /** Merge streamed block replies before sending. */
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
  /** Max characters per outbound text chunk. */
  textChunkLimit?: number;
  /** Chunking mode: "length" (split by size) or "newline" (split on newlines). */
  chunkMode?: "length" | "newline";
  /** Debounce window (ms) for batching rapid inbound messages. */
  debounceMs?: number;
  /** Send read receipts for incoming messages. */
  sendReadReceipts?: boolean;
  /** Inbound message prefix override. */
  messagePrefix?: string;
  /** Outbound response prefix override. */
  responsePrefix?: string;
  /** Same-phone setup (bot uses your personal number). */
  selfChatMode?: boolean;
  /** Group message policy (default: allowlist). */
  groupPolicy?: GroupPolicy;
  /** Allowlist for group senders. */
  groupAllowFrom?: Array<string | number>;
  /** Per-group config overrides keyed by group ID. */
  groups?: Record<string, ChatwootGroupConfig>;
  /** Supplemental context visibility policy. */
  contextVisibility?: ContextVisibilityMode;
};

export type ChatwootConfig = ChatwootAccountConfig & {
  accounts?: Record<string, ChatwootAccountConfig>;
  defaultAccount?: string;
};

export type CoreConfig = OpenClawConfig & {
  channels?: OpenClawConfig["channels"] & {
    chatwoot?: ChatwootConfig;
  };
};

export type ResolvedChatwootAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  baseUrl: string;
  apiKey: string;
  chatwootAccountId: string;
  webhookSecret: string;
  config: ChatwootAccountConfig;
};

export type ChatwootProbe = BaseProbeResult<string> & {
  baseUrl: string;
  chatwootAccountId: string;
};

// -- Chatwoot webhook payload types --

export type ChatwootWebhookEvent =
  | "message_created"
  | "message_updated"
  | "conversation_opened"
  | "conversation_resolved"
  | "webwidget_triggered";

export type ChatwootSender = {
  id: number;
  name?: string;
  email?: string;
  phone_number?: string;
  identifier?: string;
  custom_attributes?: Record<string, unknown>;
  type?: string;
};

export type ChatwootAttachment = {
  id: number;
  message_id: number;
  file_type: string;
  account_id: number;
  data_url: string;
  thumb_url?: string;
  file_size?: number;
};

export type ChatwootConversationPayload = {
  id: number;
  display_id: number;
  inbox_id: number;
  status: string;
  assignee_id?: number | null;
  contact?: {
    id: number;
    name?: string;
    email?: string;
  };
};

/**
 * Webhook payload for message_created / message_updated events.
 * Maps to Chatwoot/Sapa's `message.webhook_data`.
 */
export type ChatwootMessageWebhookPayload = {
  event: ChatwootWebhookEvent;
  id: number;
  account?: { id: number; name?: string };
  content?: string;
  content_type?: string;
  content_attributes?: Record<string, unknown>;
  conversation: ChatwootConversationPayload;
  inbox?: { id: number; name?: string };
  message_type?: number | string;
  private?: boolean;
  sender?: ChatwootSender;
  source_id?: string;
  created_at?: string;
  attachments?: ChatwootAttachment[];
};

/**
 * Webhook payload for conversation events (conversation_opened, conversation_resolved).
 */
export type ChatwootConversationWebhookPayload = {
  event: ChatwootWebhookEvent;
  id: number;
  display_id?: number;
  account?: { id: number; name?: string };
  inbox?: { id: number; name?: string };
  status?: string;
  contact?: ChatwootSender;
};

/** Discriminated webhook payload from Chatwoot. */
export type ChatwootWebhookPayload =
  | ChatwootMessageWebhookPayload
  | ChatwootConversationWebhookPayload;
