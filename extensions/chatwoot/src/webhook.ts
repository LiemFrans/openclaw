import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { safeEqualSecret } from "openclaw/plugin-sdk/browser-security-runtime";
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
import type { ChatwootMessageWebhookPayload, CoreConfig } from "./types.js";

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
  const to = `chatwoot:${inboxId}:${conversationId}`;

  // Each Chatwoot conversation maps to its own session (like WhatsApp groups).
  // Use conversation-scoped peer with kind "group" so the session key includes
  // the peer ID, giving each conversation its own isolated session.
  const conversationPeerId = `chatwoot:${inboxId}:${conversationId}`;

  try {
    const core = deps.runtime;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "chatwoot",
      accountId: account.accountId,
      peer: { id: conversationPeerId, kind: "group" },
    });

    const storePath = core.channel.session.resolveStorePath(undefined, {
      agentId: route.agentId,
    });

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: content ?? "",
      RawBody: content ?? "",
      CommandBody: content ?? "",
      From: from,
      To: to,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: "group" as const,
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
