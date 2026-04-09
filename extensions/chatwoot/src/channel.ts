import { describeAccountSnapshot } from "openclaw/plugin-sdk/account-helpers";
import { createScopedDmSecurityResolver } from "openclaw/plugin-sdk/channel-config-helpers";
import { createChatChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import {
  createComputedAccountStatusAdapter,
  createDefaultChannelRuntimeState,
} from "openclaw/plugin-sdk/status-helpers";
import { resolveChatwootAccount, type ResolvedChatwootAccount } from "./accounts.js";
import {
  buildBaseChannelStatusSummary,
  DEFAULT_ACCOUNT_ID,
  type ChannelPlugin,
} from "./channel-api.js";
import { ChatwootChannelConfigSchema } from "./config-schema.js";
import { collectRuntimeConfigAssignments, secretTargetRegistryEntries } from "./secret-contract.js";
import { sendChatwootMessage, sendChatwootMedia } from "./send.js";
import { chatwootSetupAdapter } from "./setup-core.js";
import { chatwootSetupWizard } from "./setup-surface.js";
import type { ChatwootProbe, CoreConfig } from "./types.js";

const meta = {
  id: "chatwoot",
  label: "Chatwoot",
  selectionLabel: "Chatwoot (Agent Bot)",
  docsPath: "/channels/chatwoot",
  docsLabel: "chatwoot",
  blurb: "Chatwoot agent bot integration; webhook-based inbound and REST API outbound.",
  order: 85,
  detailLabel: "Chatwoot",
  systemImage: "message",
  markdownCapable: true,
};

const resolveChatwootDmPolicy = createScopedDmSecurityResolver<ResolvedChatwootAccount>({
  channelKey: "chatwoot",
  resolvePolicy: (account) => account.config.dmPolicy,
  resolveAllowFrom: (account) => account.config.allowFrom,
  policyPathSuffix: "dmPolicy",
});

export const chatwootPlugin: ChannelPlugin<ResolvedChatwootAccount, ChatwootProbe> =
  createChatChannelPlugin({
    base: {
      id: "chatwoot",
      meta,
      setup: chatwootSetupAdapter,
      setupWizard: chatwootSetupWizard,
      capabilities: {
        chatTypes: ["direct"],
        media: true,
        blockStreaming: true,
      },
      reload: { configPrefixes: ["channels.chatwoot"] },
      configSchema: ChatwootChannelConfigSchema,
      config: {
        listAccountIds: () => [DEFAULT_ACCOUNT_ID],
        resolveAccount: (cfg, accountId) =>
          resolveChatwootAccount({ cfg: cfg as CoreConfig, accountId }),
        defaultAccountId: () => DEFAULT_ACCOUNT_ID,
        hasConfiguredState: ({ env }) =>
          typeof env?.CHATWOOT_BASE_URL === "string" &&
          env.CHATWOOT_BASE_URL.trim().length > 0 &&
          typeof env?.CHATWOOT_API_KEY === "string" &&
          env.CHATWOOT_API_KEY.trim().length > 0,
        isConfigured: (account: ResolvedChatwootAccount) => account.configured,
        describeAccount: (account: ResolvedChatwootAccount) =>
          describeAccountSnapshot({
            account,
            configured: account.configured,
            extra: {
              baseUrl: account.baseUrl || "(not set)",
              chatwootAccountId: account.chatwootAccountId || "(not set)",
              apiKey: account.apiKey ? "***" : "(not set)",
              webhookSecret: account.webhookSecret ? "configured" : "(not set)",
            },
          }),
      },
      secrets: {
        secretTargetRegistryEntries,
        collectRuntimeConfigAssignments,
      },
      status: createComputedAccountStatusAdapter<ResolvedChatwootAccount, ChatwootProbe>({
        defaultRuntime: createDefaultChannelRuntimeState(DEFAULT_ACCOUNT_ID),
        buildChannelSummary: ({ account, snapshot }) => ({
          ...buildBaseChannelStatusSummary(snapshot),
          baseUrl: account.baseUrl,
          chatwootAccountId: account.chatwootAccountId,
          probe: snapshot.probe,
          lastProbeAt: snapshot.lastProbeAt ?? null,
        }),
        resolveAccountSnapshot: ({ account }) => ({
          accountId: account.accountId,
          name: account.accountId,
          enabled: account.enabled,
          configured: account.configured,
          extra: {
            baseUrl: account.baseUrl,
            chatwootAccountId: account.chatwootAccountId,
          },
        }),
      }),
    },

    // DM security: Chatwoot manages its own inbox access, so default to open.
    security: {
      resolveDmPolicy: resolveChatwootDmPolicy,
    },

    // Threading: top-level replies
    threading: { topLevelReplyToMode: "reply" },

    // Outbound: send messages to Chatwoot conversations
    outbound: {
      base: {
        deliveryMode: "direct" as const,
        chunkerMode: "markdown" as const,
        textChunkLimit: 10_000,
      },
      attachedResults: {
        channel: "chatwoot",
        sendText: async (params) => {
          const result = await sendChatwootMessage({
            cfg: params.cfg as CoreConfig,
            accountId: params.accountId ?? undefined,
            conversationId: params.to,
            text: params.text,
          });
          return { messageId: String(result.messageId) };
        },
        sendMedia: async (params) => {
          const result = await sendChatwootMedia({
            cfg: params.cfg as CoreConfig,
            accountId: params.accountId ?? undefined,
            conversationId: params.to,
            filePath: params.mediaUrl ?? "",
            caption: params.text,
          });
          return { messageId: String(result.messageId) };
        },
      },
    },
  });
