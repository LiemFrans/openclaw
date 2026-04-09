import { resolveChatwootAccount } from "./accounts.js";
import { ChatwootClient } from "./client.js";
import type { CoreConfig } from "./types.js";

export type SendChatwootMessageParams = {
  cfg: CoreConfig;
  accountId?: string;
  conversationId: string;
  text: string;
  replyTo?: string;
};

export type SendChatwootMessageResult = {
  messageId: number;
  conversationId: string;
};

export type SendChatwootMediaParams = {
  cfg: CoreConfig;
  accountId?: string;
  conversationId: string;
  filePath: string;
  caption?: string;
};

function parseConversationId(conversationId: string): number {
  const parsed = Number.parseInt(conversationId, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid Chatwoot conversation ID: ${conversationId}`);
  }
  return parsed;
}

export async function sendChatwootMessage(
  params: SendChatwootMessageParams,
): Promise<SendChatwootMessageResult> {
  const account = resolveChatwootAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.configured) {
    throw new Error("Chatwoot is not configured (need baseUrl, apiKey, and accountId).");
  }

  const client = new ChatwootClient({
    baseUrl: account.baseUrl,
    apiKey: account.apiKey,
  });

  const convId = parseConversationId(params.conversationId);
  const result = await client.sendMessage(account.chatwootAccountId, convId, params.text);

  return {
    messageId: result.id,
    conversationId: params.conversationId,
  };
}

export async function sendChatwootMedia(
  params: SendChatwootMediaParams,
): Promise<SendChatwootMessageResult> {
  const account = resolveChatwootAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.configured) {
    throw new Error("Chatwoot is not configured (need baseUrl, apiKey, and accountId).");
  }

  const client = new ChatwootClient({
    baseUrl: account.baseUrl,
    apiKey: account.apiKey,
  });

  const convId = parseConversationId(params.conversationId);
  const result = await client.sendMediaMessage(
    account.chatwootAccountId,
    convId,
    params.filePath,
    params.caption,
  );

  return {
    messageId: result.id,
    conversationId: params.conversationId,
  };
}
