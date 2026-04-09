import type {
  SecretTargetRegistryEntry,
  ResolverContext,
  SecretDefaults,
} from "openclaw/plugin-sdk/channel-secret-basic-runtime";
import {
  collectSimpleChannelFieldAssignments,
  getChannelSurface,
} from "openclaw/plugin-sdk/channel-secret-basic-runtime";

export const secretTargetRegistryEntries = [
  {
    id: "channels.chatwoot.apiKey",
    targetType: "channels.chatwoot.apiKey",
    configFile: "openclaw.json",
    pathPattern: "channels.chatwoot.apiKey",
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: "channels.chatwoot.webhookSecret",
    targetType: "channels.chatwoot.webhookSecret",
    configFile: "openclaw.json",
    pathPattern: "channels.chatwoot.webhookSecret",
    secretShape: "secret_input",
    expectedResolvedValue: "string",
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
] satisfies SecretTargetRegistryEntry[];

export function collectRuntimeConfigAssignments(params: {
  config: { channels?: Record<string, unknown> };
  defaults?: SecretDefaults;
  context: ResolverContext;
}): void {
  const resolved = getChannelSurface(params.config, "chatwoot");
  if (!resolved) {
    return;
  }
  const { channel, surface } = resolved;

  collectSimpleChannelFieldAssignments({
    channelKey: "chatwoot",
    field: "apiKey",
    channel,
    surface,
    defaults: params.defaults,
    context: params.context,
    topInactiveReason: "Chatwoot is not enabled.",
    accountInactiveReason: "Chatwoot account is disabled.",
  });

  collectSimpleChannelFieldAssignments({
    channelKey: "chatwoot",
    field: "webhookSecret",
    channel,
    surface,
    defaults: params.defaults,
    context: params.context,
    topInactiveReason: "Chatwoot is not enabled.",
    accountInactiveReason: "Chatwoot account is disabled.",
  });
}

export const channelSecrets = {
  secretTargetRegistryEntries,
  collectRuntimeConfigAssignments,
};
