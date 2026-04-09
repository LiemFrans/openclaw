import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "./runtime-api.js";

const { setRuntime: setChatwootRuntime, getRuntime: getChatwootRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Chatwoot runtime not initialized");
export { getChatwootRuntime, setChatwootRuntime };
