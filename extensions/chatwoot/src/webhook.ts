import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { safeEqualSecret } from "openclaw/plugin-sdk/browser-security-runtime";
import { normalizeAllowFromList } from "openclaw/plugin-sdk/channel-policy";
import { dispatchInboundReplyWithBase } from "openclaw/plugin-sdk/inbound-reply-dispatch";
import { deliverFormattedTextWithAttachments } from "openclaw/plugin-sdk/reply-payload";
import {
  readRequestBodyWithLimit,
  isRequestBodyLimitError,
  requestBodyErrorToText,
} from "openclaw/plugin-sdk/webhook-ingress";
import { resolveChatwootAccount } from "./accounts.js";
import { ChatwootClient } from "./client.js";
import type { PluginRuntime } from "./runtime-api.js";
import type {
  ChatwootGroupConfig,
  ChatwootMessageWebhookPayload,
  ChatwootSender,
  CoreConfig,
} from "./types.js";

const WEBHOOK_MAX_BODY_BYTES = 512 * 1024;
const WEBHOOK_BODY_TIMEOUT_MS = 5_000;

// Chatwoot message_type enum: 0=incoming, 1=outgoing, 2=activity, 3=template
const MESSAGE_TYPE_INCOMING = 0;
const MESSAGE_TYPE_INCOMING_LABEL = "incoming";

export function isIncomingMessageType(messageType: unknown): boolean {
  if (messageType === MESSAGE_TYPE_INCOMING || messageType === String(MESSAGE_TYPE_INCOMING)) {
    return true;
  }
  if (typeof messageType !== "string") {
    return false;
  }
  return messageType.trim().toLowerCase() === MESSAGE_TYPE_INCOMING_LABEL;
}

/**
 * Extract phone number digits from a WhatsApp JID like "6285156249703@c.us".
 * Returns the leading digits before "@" or undefined if not a phone-style JID.
 */
function extractPhoneFromJid(jid: string | undefined): string | undefined {
  if (!jid) {
    return undefined;
  }
  const match = /^(\d+)@/.exec(jid);
  return match?.[1];
}

/**
 * Build a set of matchable sender IDs from a Chatwoot sender payload.
 * Users can put any of these values in `allowFrom`:
 * - Chatwoot numeric contact ID (e.g. "1679")
 * - Phone number from WAHA JID (e.g. "6285156249703")
 * - Full JID (e.g. "6285156249703@c.us")
 * - Sender identifier (e.g. "lid-6285156249703@c.us")
 * - Sender phone_number field
 */
export function resolveChatwootSenderCandidates(sender?: ChatwootSender): string[] {
  const candidates: string[] = [];
  if (!sender) {
    return candidates;
  }
  // Chatwoot numeric contact ID
  const id = String(sender.id ?? "");
  if (id && id !== "unknown") {
    candidates.push(id);
  }
  // Phone number from WAHA WhatsApp JID (most common user expectation)
  const jid =
    typeof sender.custom_attributes?.waha_whatsapp_jid === "string"
      ? sender.custom_attributes.waha_whatsapp_jid
      : undefined;
  const phoneFromJid = extractPhoneFromJid(jid);
  if (phoneFromJid) {
    candidates.push(phoneFromJid);
  }
  // Full JID if present
  if (jid) {
    candidates.push(jid);
  }
  // Sender identifier (may include lid prefix)
  if (sender.identifier) {
    candidates.push(sender.identifier);
    // Also extract phone digits from identifier like "lid-6285156249703@c.us"
    const identifierPhone = extractPhoneFromJid(sender.identifier.replace(/^lid-/, ""));
    if (identifierPhone && identifierPhone !== phoneFromJid) {
      candidates.push(identifierPhone);
    }
  }
  // Sender phone_number field (if Chatwoot has it)
  if (sender.phone_number) {
    const cleaned = sender.phone_number.replace(/[^\d]/g, "");
    if (cleaned && !candidates.includes(cleaned)) {
      candidates.push(cleaned);
    }
  }
  return candidates;
}

/**
 * Check whether a Chatwoot sender is allowed by the configured dmPolicy + allowFrom.
 * Returns true when the sender should be allowed through.
 */
export function isChatwootSenderAllowed(params: {
  dmPolicy: string;
  allowFrom: string[];
  sender?: ChatwootSender;
}): boolean {
  const { dmPolicy, allowFrom } = params;
  // "open" policy allows everyone
  if (dmPolicy === "open") {
    return true;
  }
  // "disabled" policy blocks everyone
  if (dmPolicy === "disabled") {
    return false;
  }
  // With no allowFrom entries, allowlist blocks everyone; pairing blocks until paired
  if (allowFrom.length === 0) {
    return false;
  }
  // Wildcard allows everyone
  if (allowFrom.includes("*")) {
    return true;
  }
  const candidates = resolveChatwootSenderCandidates(params.sender);
  // Check if any candidate matches any allowFrom entry
  return candidates.some((candidate) => allowFrom.includes(candidate));
}

/**
 * Build a set of matchable group IDs from a Chatwoot group sender payload.
 * Users can put any of these values in `groupAllowFrom`:
 * - Chatwoot numeric group contact ID (e.g. "1666")
 * - Group JID from identifier (e.g. "6281380888035-1572323526@g.us")
 * - Group JID from waha_whatsapp_chat_id (e.g. "120363364780250652@g.us")
 */
export function resolveChatwootGroupCandidates(sender?: ChatwootSender): string[] {
  const candidates: string[] = [];
  if (!sender) {
    return candidates;
  }
  // Chatwoot numeric contact ID (group entity)
  const id = String(sender.id ?? "");
  if (id && id !== "unknown") {
    candidates.push(id);
  }
  // Group identifier (e.g. "6281380888035-1572323526@g.us")
  if (sender.identifier) {
    candidates.push(sender.identifier);
  }
  // Group chat ID from WAHA custom attributes
  const chatId =
    typeof sender.custom_attributes?.waha_whatsapp_chat_id === "string"
      ? sender.custom_attributes.waha_whatsapp_chat_id
      : undefined;
  if (chatId && chatId !== sender.identifier) {
    candidates.push(chatId);
  }
  return candidates;
}

/**
 * Check whether a Chatwoot group conversation is allowed by groupPolicy + groupAllowFrom.
 * Returns true when the group should be allowed through.
 */
export function isChatwootGroupAllowed(params: {
  groupPolicy: string;
  groupAllowFrom: string[];
  sender?: ChatwootSender;
}): boolean {
  const { groupPolicy, groupAllowFrom } = params;
  // "open" policy allows all groups
  if (groupPolicy === "open") {
    return true;
  }
  // "disabled" policy blocks all groups
  if (groupPolicy === "disabled") {
    return false;
  }
  // With no groupAllowFrom entries, allowlist blocks all groups
  if (groupAllowFrom.length === 0) {
    return false;
  }
  // Wildcard allows all groups
  if (groupAllowFrom.includes("*")) {
    return true;
  }
  const candidates = resolveChatwootGroupCandidates(params.sender);
  return candidates.some((candidate) => groupAllowFrom.includes(candidate));
}

/**
 * Resolve per-group config from the `groups` map by matching group candidate IDs.
 * First exact match wins; falls back to wildcard `"*"` entry.
 */
export function resolveChatwootGroupConfig(params: {
  groups?: Record<string, ChatwootGroupConfig>;
  sender?: ChatwootSender;
}): { groupConfig?: ChatwootGroupConfig; wildcardConfig?: ChatwootGroupConfig } {
  const { groups } = params;
  if (!groups) {
    return {};
  }
  const wildcardConfig = groups["*"];
  const candidates = resolveChatwootGroupCandidates(params.sender);
  for (const candidate of candidates) {
    const match = groups[candidate];
    if (match) {
      return { groupConfig: match, wildcardConfig };
    }
  }
  return { wildcardConfig };
}

/**
 * Resolve whether requireMention is active for a Chatwoot group.
 * Per-group config takes priority over wildcard; default is false (no mention required).
 */
export function resolveChatwootRequireMention(params: {
  groupConfig?: ChatwootGroupConfig;
  wildcardConfig?: ChatwootGroupConfig;
}): boolean {
  if (params.groupConfig?.requireMention !== undefined) {
    return params.groupConfig.requireMention;
  }
  if (params.wildcardConfig?.requireMention !== undefined) {
    return params.wildcardConfig.requireMention;
  }
  return false;
}

function toMentionTarget(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const withoutAt = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (!withoutAt) {
    return undefined;
  }
  // Allow plain phone references such as @6285959823371.
  if (/^\+?\d+$/.test(withoutAt)) {
    return withoutAt.replace(/^\+/, "");
  }
  // Allow JID-like entries from allowFrom (e.g. 6285...@c.us, lid-6285...@c.us).
  const phoneFromJid = extractPhoneFromJid(withoutAt.replace(/^lid-/, ""));
  if (phoneFromJid) {
    return phoneFromJid;
  }
  // Allow plain bot aliases (e.g. openclaw).
  if (/^[a-z0-9._-]+$/i.test(withoutAt)) {
    return withoutAt;
  }
  return undefined;
}

export function resolveChatwootMentionTargets(allowFrom?: Array<string | number>): string[] {
  const targets = new Set<string>(["openclaw"]);
  for (const entry of normalizeAllowFromList(allowFrom)) {
    const target = toMentionTarget(entry);
    if (target) {
      targets.add(target.toLowerCase());
    }
  }
  return [...targets];
}

/**
 * Check whether an explicit @mention token appears in the message content.
 * Matches case-insensitive mentions such as "@openclaw" or "@6285959823371".
 */
export function isBotMentioned(content: string | undefined, botName: string): boolean {
  if (!content || !botName) {
    return false;
  }
  const target = toMentionTarget(botName);
  if (!target) {
    return false;
  }
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Mention must be explicitly prefixed with '@' to avoid false positives from plain words.
  const pattern = new RegExp(`(?:^|[\\s(])@${escaped}(?=$|[\\s).,!?;:])`, "i");
  return pattern.test(content);
}

function normalizeChatwootNumericId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.trunc(parsed);
}

export function resolveChatwootConversationId(
  payload: Pick<ChatwootMessageWebhookPayload, "conversation">,
): number | undefined {
  // Chatwoot API expects canonical conversation.id in the REST path.
  // display_id can be non-canonical and may collide across inboxes.
  return (
    normalizeChatwootNumericId(payload.conversation?.id) ??
    normalizeChatwootNumericId(payload.conversation?.display_id)
  );
}

export function buildChatwootSessionPeerId(params: { inboxId: string; senderId: string }): string {
  // Scope direct-chat sessions by inbox so one sender in different inboxes
  // cannot share the same session/thread state.
  return `chatwoot:${params.inboxId}:${params.senderId}`;
}

function isWhatsAppGroupSender(sender?: ChatwootSender): boolean {
  if (sender?.identifier?.endsWith("@g.us")) {
    return true;
  }
  const chatId = sender?.custom_attributes?.waha_whatsapp_chat_id;
  return typeof chatId === "string" && chatId.endsWith("@g.us");
}

function deriveChannelName(sender?: ChatwootSender, inboxName?: string): string {
  if (sender?.custom_attributes) {
    for (const key of Object.keys(sender.custom_attributes)) {
      if (key.startsWith("waha_whatsapp_")) {
        return "whatsapp";
      }
    }
  }
  if (inboxName) {
    const firstWord = inboxName.trim().split(/\s+/)[0]?.toLowerCase();
    if (firstWord) {
      return firstWord;
    }
  }
  return "chat";
}

/**
 * Build a descriptive peer ID for Chatwoot conversations.
 *
 * DM format:    chatwoot:whatsapp-{lid}-{jid}-{contact name}
 * Group format: chatwoot:whatsapp-{group chat id}-{group name}
 * Fallback:     chatwoot:{inboxId}:{conversationId}
 */
export function buildDescriptiveChatwootPeerId(params: {
  inboxId: string;
  conversationId: number;
  sender?: ChatwootSender;
  inboxName?: string;
}): string {
  const { sender, inboxName } = params;
  const channel = deriveChannelName(sender, inboxName);

  if (isWhatsAppGroupSender(sender)) {
    const groupId =
      sender?.identifier ??
      (typeof sender?.custom_attributes?.waha_whatsapp_chat_id === "string"
        ? sender.custom_attributes.waha_whatsapp_chat_id
        : "");
    const groupName = sender?.name ?? "";
    if (groupId) {
      return `chatwoot:${channel}-${groupId}-${groupName}`;
    }
  } else if (sender?.custom_attributes) {
    const lid =
      typeof sender.custom_attributes.waha_whatsapp_lid === "string"
        ? sender.custom_attributes.waha_whatsapp_lid
        : "";
    const jid =
      typeof sender.custom_attributes.waha_whatsapp_jid === "string"
        ? sender.custom_attributes.waha_whatsapp_jid
        : "";
    const name = sender.name ?? "";
    if (lid || jid) {
      return `chatwoot:${channel}-${lid}-${jid}-${name}`;
    }
  }

  // Fallback for non-WAHA or missing attributes
  return `chatwoot:${params.inboxId}:${params.conversationId}`;
}

function getHeader(headers: IncomingMessage["headers"], name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Verify Chatwoot/Sapa webhook HMAC signature.
 * Supports both X-Sapa-* and X-Chatwoot-* header prefixes.
 *
 * Signature: sha256=HMAC-SHA256("timestamp.body", secret)
 */
export function verifyChatwootWebhookSignature(params: {
  headers: IncomingMessage["headers"];
  rawBody: string;
  secret: string;
}): boolean {
  if (!params.secret) {
    // No secret configured — skip verification
    return true;
  }

  // Support both header prefixes (Sapa fork and standard Chatwoot)
  const timestamp =
    getHeader(params.headers, "x-sapa-timestamp") ??
    getHeader(params.headers, "x-chatwoot-timestamp");
  const signature =
    getHeader(params.headers, "x-sapa-signature") ??
    getHeader(params.headers, "x-chatwoot-signature");

  if (!timestamp || !signature) {
    return false;
  }

  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    return false;
  }
  const providedHmac = signature.slice(expectedPrefix.length);

  const computedHmac = crypto
    .createHmac("sha256", params.secret)
    .update(`${timestamp}.${params.rawBody}`)
    .digest("hex");

  return safeEqualSecret(computedHmac, providedHmac);
}

function respondJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function respondText(res: ServerResponse, statusCode: number, body: string): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end(body);
}

export type ChatwootWebhookHandlerDeps = {
  loadConfig: () => CoreConfig;
  runtime: PluginRuntime;
  log?: (message: string) => void;
  error?: (message: string) => void;
};

/**
 * Handle an inbound Chatwoot webhook POST.
 */
export async function handleChatwootWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  deps: ChatwootWebhookHandlerDeps,
): Promise<boolean> {
  if (req.method !== "POST") {
    respondText(res, 405, "Method Not Allowed");
    return true;
  }

  let rawBody: string;
  try {
    rawBody = await readRequestBodyWithLimit(req, {
      maxBytes: WEBHOOK_MAX_BODY_BYTES,
      timeoutMs: WEBHOOK_BODY_TIMEOUT_MS,
    });
  } catch (err) {
    if (isRequestBodyLimitError(err)) {
      respondText(res, 413, requestBodyErrorToText(err.code));
    } else {
      respondText(res, 400, "Bad Request");
    }
    return true;
  }

  const cfg = deps.loadConfig();
  const account = resolveChatwootAccount({ cfg });

  if (!account.configured) {
    deps.error?.("chatwoot: webhook received but channel is not configured");
    respondJson(res, 503, { error: "Chatwoot channel not configured" });
    return true;
  }

  // Verify signature if secret is configured
  if (
    account.webhookSecret &&
    !verifyChatwootWebhookSignature({
      headers: req.headers,
      rawBody,
      secret: account.webhookSecret,
    })
  ) {
    deps.error?.("chatwoot: webhook signature verification failed");
    respondText(res, 401, "Unauthorized");
    return true;
  }

  let payload: ChatwootMessageWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ChatwootMessageWebhookPayload;
  } catch {
    respondText(res, 400, "Invalid JSON");
    return true;
  }

  // Only process message_created events
  if (payload.event !== "message_created") {
    respondJson(res, 200, { status: "ignored", reason: `event: ${String(payload.event)}` });
    return true;
  }

  // Process incoming messages from both numeric (0) and string ("incoming") payload variants.
  if (!isIncomingMessageType(payload.message_type)) {
    respondJson(res, 200, { status: "ignored", reason: "not an incoming message" });
    return true;
  }

  // Skip private/internal notes
  if (payload.private) {
    respondJson(res, 200, { status: "ignored", reason: "private note" });
    return true;
  }

  // Skip messages without content
  const content = payload.content?.trim();
  if (!content && (!payload.attachments || payload.attachments.length === 0)) {
    respondJson(res, 200, { status: "ignored", reason: "empty message" });
    return true;
  }

  const conversationId = resolveChatwootConversationId(payload);
  if (!conversationId) {
    respondJson(res, 200, { status: "ignored", reason: "no conversation id" });
    return true;
  }

  const inboxId = String(payload.conversation?.inbox_id ?? "default");
  const senderId = String(payload.sender?.id ?? "unknown");
  const senderName = payload.sender?.name;
  const from = buildChatwootSessionPeerId({ inboxId, senderId });

  // Build a descriptive peer ID using WAHA WhatsApp attributes when available.
  // DM: chatwoot:whatsapp-{lid}-{jid}-{name}
  // Group: chatwoot:whatsapp-{group id}-{group name}
  const conversationPeerId = buildDescriptiveChatwootPeerId({
    inboxId,
    conversationId,
    sender: payload.sender,
    inboxName: payload.inbox?.name,
  });
  const to = conversationPeerId;
  const isGroup = isWhatsAppGroupSender(payload.sender);
  const chatType = isGroup ? ("group" as const) : ("direct" as const);

  deps.log?.(
    `chatwoot: conversation=${conversationId} sender=${senderId} type=${chatType} peer=${conversationPeerId}`,
  );

  // Enforce access policy (DM for direct conversations, group for groups).
  if (isGroup) {
    const groupPolicy = account.config.groupPolicy ?? "allowlist";
    if (groupPolicy === "disabled") {
      deps.log?.(`chatwoot: drop group conversation=${conversationId} (groupPolicy=disabled)`);
      respondJson(res, 200, { status: "ignored", reason: "groupPolicy=disabled" });
      return true;
    }
    if (groupPolicy !== "open") {
      const configGroupAllowFrom = normalizeAllowFromList(account.config.groupAllowFrom);
      const allowed = isChatwootGroupAllowed({
        groupPolicy,
        groupAllowFrom: configGroupAllowFrom,
        sender: payload.sender,
      });
      if (!allowed) {
        deps.log?.(
          `chatwoot: drop group conversation=${conversationId} (groupPolicy=${groupPolicy}, not in groupAllowFrom)`,
        );
        respondJson(res, 200, {
          status: "ignored",
          reason: `groupPolicy=${groupPolicy} (not allowed)`,
        });
        return true;
      }
    }
  } else {
    const dmPolicy = account.config.dmPolicy ?? "open";
    if (dmPolicy === "disabled") {
      deps.log?.(`chatwoot: drop sender=${senderId} (dmPolicy=disabled)`);
      respondJson(res, 200, { status: "ignored", reason: "dmPolicy=disabled" });
      return true;
    }
    if (dmPolicy !== "open") {
      const configAllowFrom = normalizeAllowFromList(account.config.allowFrom);
      const allowed = isChatwootSenderAllowed({
        dmPolicy,
        allowFrom: configAllowFrom,
        sender: payload.sender,
      });
      if (!allowed) {
        deps.log?.(`chatwoot: drop sender=${senderId} (dmPolicy=${dmPolicy}, not in allowFrom)`);
        respondJson(res, 200, { status: "ignored", reason: `dmPolicy=${dmPolicy} (not allowed)` });
        return true;
      }
    }
  }

  // Enforce per-group requireMention gate.
  if (isGroup && account.config.groups) {
    const { groupConfig, wildcardConfig } = resolveChatwootGroupConfig({
      groups: account.config.groups,
      sender: payload.sender,
    });
    const requireMention = resolveChatwootRequireMention({ groupConfig, wildcardConfig });
    if (requireMention) {
      const mentionTargets = resolveChatwootMentionTargets(account.config.allowFrom);
      const mentioned = mentionTargets.some((target) => isBotMentioned(content, target));
      if (!mentioned) {
        deps.log?.(
          `chatwoot: drop group conversation=${conversationId} (requireMention, not mentioned)`,
        );
        respondJson(res, 200, { status: "ignored", reason: "requireMention (not mentioned)" });
        return true;
      }
    }
  }

  try {
    const core = deps.runtime;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "chatwoot",
      accountId: account.accountId,
      peer: { id: conversationPeerId, kind: isGroup ? "group" : "direct" },
    });

    const storePath = core.channel.session.resolveStorePath(undefined, {
      agentId: route.agentId,
    });

    // Apply messagePrefix to inbound message body when configured.
    const rawContent = content ?? "";
    const messagePrefix = account.config.messagePrefix;
    const prefixedBody = messagePrefix ? `${messagePrefix}${rawContent}` : rawContent;

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: prefixedBody,
      RawBody: rawContent,
      CommandBody: rawContent,
      From: from,
      To: to,
      ConversationLabel: conversationPeerId,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: chatType,
      SenderName: senderName,
      SenderId: senderId,
      Provider: "chatwoot" as const,
      Surface: "chatwoot" as const,
      MessageSid: String(payload.id),
      Timestamp: Date.now(),
      OriginatingChannel: "chatwoot" as const,
      OriginatingTo: to,
    });

    const client = new ChatwootClient({
      baseUrl: account.baseUrl,
      apiKey: account.apiKey,
    });
    await dispatchInboundReplyWithBase({
      cfg,
      channel: "chatwoot",
      accountId: account.accountId,
      route,
      storePath,
      ctxPayload,
      core,
      deliver: async (payload) => {
        await deliverFormattedTextWithAttachments({
          payload,
          send: async ({ text }) => {
            await client.sendMessage(account.chatwootAccountId, conversationId, text);
          },
        });
      },
      onRecordError: (err) => {
        deps.error?.(`chatwoot: session record error: ${String(err)}`);
      },
      onDispatchError: (err, info) => {
        deps.error?.(`chatwoot: ${info.kind} reply failed: ${String(err)}`);
      },
    });
  } catch (err) {
    deps.error?.(`chatwoot: dispatch error: ${String(err)}`);
    respondJson(res, 500, { error: "Internal dispatch error" });
    return true;
  }

  respondJson(res, 200, { status: "ok" });
  return true;
}
