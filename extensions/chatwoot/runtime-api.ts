// Keep the bundled runtime entry narrow so generic runtime activation does not
// import the broad Chatwoot API barrel just to install runtime state.
export { setChatwootRuntime } from "./src/runtime.js";
