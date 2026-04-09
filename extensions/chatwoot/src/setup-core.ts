import type { ChannelSetupAdapter } from "openclaw/plugin-sdk/channel-setup";
import { normalizeAccountId } from "openclaw/plugin-sdk/routing";
import {
  applyAccountNameToChannelSection,
  patchScopedAccountConfig,
} from "openclaw/plugin-sdk/setup";
import type { CoreConfig, ChatwootAccountConfig } from "./types.js";

const channel = "chatwoot" as const;

export function updateChatwootAccountConfig(
  cfg: CoreConfig,
  accountId: string,
  patch: Partial<ChatwootAccountConfig>,
): CoreConfig {
  return patchScopedAccountConfig({
    cfg,
    channelKey: channel,
    accountId,
    patch,
    ensureChannelEnabled: false,
    ensureAccountEnabled: false,
  }) as CoreConfig;
}

export const chatwootSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  applyAccountName: ({ cfg, accountId, name }) =>
    applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name,
    }),
  applyAccountConfig: ({ cfg, accountId, input }) => {
    const namedConfig = applyAccountNameToChannelSection({
      cfg,
      channelKey: channel,
      accountId,
      name: input.name,
    });
    const patch: Partial<ChatwootAccountConfig> = {
      enabled: true,
      baseUrl: (input as Record<string, unknown>).baseUrl as string | undefined,
      apiKey: (input as Record<string, unknown>).apiKey as string | undefined,
      accountId: (input as Record<string, unknown>).accountId as string | undefined,
      webhookSecret: (input as Record<string, unknown>).webhookSecret as string | undefined,
    };
    return patchScopedAccountConfig({
      cfg: namedConfig,
      channelKey: channel,
      accountId,
      patch,
    }) as CoreConfig;
  },
};
