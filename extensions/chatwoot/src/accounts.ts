import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input";
import type { CoreConfig, ChatwootAccountConfig, ResolvedChatwootAccount } from "./types.js";

export type { ResolvedChatwootAccount };
export { DEFAULT_ACCOUNT_ID };

/**
 * Normalize a Chatwoot base URL — strip trailing slashes, ensure https:// prefix.
 */
export function normalizeChatwootBaseUrl(raw?: string): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

function getChatwootSection(cfg: CoreConfig): ChatwootAccountConfig | undefined {
  return cfg.channels?.chatwoot;
}

export function resolveChatwootAccount(params: {
  cfg: CoreConfig;
  accountId?: string | null;
}): ResolvedChatwootAccount {
  const section = getChatwootSection(params.cfg);
  const accountId = params.accountId?.trim() || DEFAULT_ACCOUNT_ID;

  const baseUrl = normalizeChatwootBaseUrl(section?.baseUrl || process.env.CHATWOOT_BASE_URL);

  const apiKey =
    normalizeResolvedSecretInputString({
      value: section?.apiKey,
      path: "channels.chatwoot.apiKey",
    }) ||
    process.env.CHATWOOT_API_KEY?.trim() ||
    "";

  const chatwootAccountId =
    section?.accountId?.trim() || process.env.CHATWOOT_ACCOUNT_ID?.trim() || "";

  const webhookSecret =
    normalizeResolvedSecretInputString({
      value: section?.webhookSecret,
      path: "channels.chatwoot.webhookSecret",
    }) ||
    process.env.CHATWOOT_WEBHOOK_SECRET?.trim() ||
    "";

  const enabled = section?.enabled !== false;
  const configured = Boolean(baseUrl && apiKey && chatwootAccountId);

  return {
    accountId,
    enabled,
    configured,
    baseUrl,
    apiKey,
    chatwootAccountId,
    webhookSecret,
    config: section ?? {},
  };
}

export function resolveChatwootAccountWithSecrets(
  cfg: CoreConfig,
  accountId?: string | null,
): ResolvedChatwootAccount {
  return resolveChatwootAccount({ cfg, accountId });
}

export function isChatwootConfigured(account: ResolvedChatwootAccount): boolean {
  return account.configured;
}
