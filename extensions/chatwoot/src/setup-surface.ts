import type { ChannelSetupWizard } from "openclaw/plugin-sdk/channel-setup";
import { createStandardChannelSetupStatus, formatDocsLink } from "openclaw/plugin-sdk/setup";
import { resolveChatwootAccount } from "./accounts.js";
import { updateChatwootAccountConfig } from "./setup-core.js";
import type { CoreConfig } from "./types.js";

const channel = "chatwoot" as const;

export const chatwootSetupWizard: ChannelSetupWizard = {
  channel,
  status: createStandardChannelSetupStatus({
    channelLabel: "Chatwoot",
    configuredLabel: "configured",
    unconfiguredLabel: "needs base URL + API key + account ID",
    configuredHint: "configured",
    unconfiguredHint: "needs base URL + API key + account ID",
    configuredScore: 1,
    unconfiguredScore: 0,
    includeStatusLine: true,
    resolveConfigured: ({ cfg, accountId }) =>
      resolveChatwootAccount({ cfg: cfg as CoreConfig, accountId }).configured,
  }),
  introNote: {
    title: "Chatwoot Agent Bot setup",
    lines: [
      "Chatwoot needs base URL + API access token + account ID.",
      "1) In Chatwoot: Settings -> Integrations -> Agent Bots -> Create",
      "2) Set the bot's outgoing_url to your OpenClaw gateway webhook endpoint",
      "3) Copy the bot's API access token",
      "Optional: configure a webhook secret for signature verification.",
      `Docs: ${formatDocsLink("/channels/chatwoot", "chatwoot")}`,
    ],
  },
  envShortcut: {
    prompt: "CHATWOOT_API_KEY + CHATWOOT_BASE_URL detected. Use env vars?",
    preferredEnvVar: "CHATWOOT_API_KEY",
    isAvailable: ({ cfg, accountId }) => {
      if (resolveChatwootAccount({ cfg: cfg as CoreConfig, accountId }).configured) {
        return false;
      }
      return Boolean(process.env.CHATWOOT_API_KEY?.trim() && process.env.CHATWOOT_BASE_URL?.trim());
    },
    apply: ({ cfg, accountId }) => {
      return updateChatwootAccountConfig(cfg as CoreConfig, accountId, {
        enabled: true,
      });
    },
  },
  credentials: [
    {
      inputKey: "url",
      providerHint: "Chatwoot instance",
      credentialLabel: "base URL",
      preferredEnvVar: "CHATWOOT_BASE_URL",
      envPrompt: "CHATWOOT_BASE_URL detected. Use env var?",
      keepPrompt: "Keep existing base URL?",
      inputPrompt: "Chatwoot base URL (e.g. https://app.chatwoot.com)",
      inspect: ({ cfg, accountId }) => {
        const account = resolveChatwootAccount({ cfg: cfg as CoreConfig, accountId });
        return {
          accountConfigured: account.configured,
          hasConfiguredValue: Boolean(account.baseUrl),
          resolvedValue: account.baseUrl || undefined,
          envValue: process.env.CHATWOOT_BASE_URL?.trim(),
        };
      },
    },
    {
      inputKey: "token",
      providerHint: "Chatwoot",
      credentialLabel: "API access token",
      preferredEnvVar: "CHATWOOT_API_KEY",
      envPrompt: "CHATWOOT_API_KEY detected. Use env var?",
      keepPrompt: "Keep existing API key?",
      inputPrompt: "Chatwoot Agent Bot API access token",
      inspect: ({ cfg, accountId }) => {
        const account = resolveChatwootAccount({ cfg: cfg as CoreConfig, accountId });
        return {
          accountConfigured: account.configured,
          hasConfiguredValue: Boolean(account.apiKey),
          resolvedValue: account.apiKey ? "***" : undefined,
          envValue: process.env.CHATWOOT_API_KEY?.trim() ? "***" : undefined,
        };
      },
    },
  ],
  textInputs: [
    {
      inputKey: "userId",
      message: "Chatwoot account ID",
      placeholder: "1",
      required: true,
      currentValue: ({ cfg, accountId }) =>
        resolveChatwootAccount({ cfg: cfg as CoreConfig, accountId }).chatwootAccountId ||
        undefined,
      validate: ({ value }) => {
        const parsed = Number.parseInt(value.trim(), 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return "Account ID must be a positive integer";
        }
        return undefined;
      },
    },
  ],
  completionNote: {
    title: "Chatwoot configured",
    lines: [
      "Make sure the bot's outgoing_url in Chatwoot points to your gateway's /chatwoot/webhook endpoint.",
      "Assign the bot to an inbox in Chatwoot to start receiving messages.",
    ],
  },
};
