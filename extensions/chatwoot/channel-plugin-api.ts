// Keep bundled channel entry imports narrow so bootstrap/discovery paths do
// not drag Chatwoot runtime/send/webhook surfaces into lightweight plugin loads.
export { chatwootPlugin } from "./src/channel.js";
