export { chatwootPlugin } from "./src/channel.js";
export { setChatwootRuntime } from "./src/runtime.js";
export {
  DEFAULT_ACCOUNT_ID,
  isChatwootConfigured,
  normalizeChatwootBaseUrl,
  resolveChatwootAccount,
  resolveChatwootAccountWithSecrets,
} from "./src/accounts.js";
export type { ResolvedChatwootAccount } from "./src/accounts.js";
export { chatwootSetupWizard } from "./src/setup-surface.js";
