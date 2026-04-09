import { defineBundledChannelEntry } from "openclaw/plugin-sdk/channel-entry-contract";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk/channel-entry-contract";

export default defineBundledChannelEntry({
  id: "chatwoot",
  name: "Chatwoot",
  description: "Chatwoot channel plugin",
  importMetaUrl: import.meta.url,
  plugin: {
    specifier: "./channel-plugin-api.js",
    exportName: "chatwootPlugin",
  },
  secrets: {
    specifier: "./secret-contract-api.js",
    exportName: "channelSecrets",
  },
  runtime: {
    specifier: "./runtime-api.js",
    exportName: "setChatwootRuntime",
  },
  registerFull(api: OpenClawPluginApi) {
    api.registerHttpRoute({
      path: "/chatwoot/webhook",
      auth: "plugin",
      handler: async (req, res) => {
        const { handleChatwootWebhook } = await import("./src/webhook.js");
        return handleChatwootWebhook(req, res, {
          loadConfig: () => api.config,
          runtime: api.runtime,
          log: (msg: string) => api.logger.info(msg),
          error: (msg: string) => api.logger.error(msg),
        });
      },
    });
  },
});
