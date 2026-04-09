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

  // Only process incoming messages (message_type=0), skip outgoing/activity/template
  if (payload.message_type !== MESSAGE_TYPE_INCOMING) {
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

  const conversationId = payload.conversation?.display_id ?? payload.conversation?.id;
  if (!conversationId) {
    respondJson(res, 200, { status: "ignored", reason: "no conversation id" });
    return true;
  }

  const senderId = String(payload.sender?.id ?? "unknown");
  const senderName = payload.sender?.name;
  const from = `chatwoot:${senderId}`;
  const to = `chatwoot:${conversationId}`;

  try {
    const core = deps.runtime;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "chatwoot",
      accountId: account.accountId,
      peer: { id: from, kind: "direct" },
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
      ChatType: "direct" as const,
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
    const convId = Number(conversationId);

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
            await client.sendMessage(account.chatwootAccountId, convId, text);
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
