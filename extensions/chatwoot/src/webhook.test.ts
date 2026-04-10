import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  buildChatwootSessionPeerId,
  isIncomingMessageType,
  resolveChatwootConversationId,
  verifyChatwootWebhookSignature,
} from "./webhook.js";

function makeSignature(secret: string, timestamp: string, body: string): string {
  const hmac = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `sha256=${hmac}`;
}

describe("verifyChatwootWebhookSignature", () => {
  const secret = "test-webhook-secret";
  const body = '{"event":"message_created","id":1}';
  const timestamp = "1712678400";

  it("accepts valid signature with X-Sapa-* headers", () => {
    const signature = makeSignature(secret, timestamp, body);
    expect(
      verifyChatwootWebhookSignature({
        headers: {
          "x-sapa-timestamp": timestamp,
          "x-sapa-signature": signature,
        },
        rawBody: body,
        secret,
      }),
    ).toBe(true);
  });

  it("accepts valid signature with X-Chatwoot-* headers", () => {
    const signature = makeSignature(secret, timestamp, body);
    expect(
      verifyChatwootWebhookSignature({
        headers: {
          "x-chatwoot-timestamp": timestamp,
          "x-chatwoot-signature": signature,
        },
        rawBody: body,
        secret,
      }),
    ).toBe(true);
  });

  it("rejects invalid signature", () => {
    expect(
      verifyChatwootWebhookSignature({
        headers: {
          "x-sapa-timestamp": timestamp,
          "x-sapa-signature":
            "sha256=0000000000000000000000000000000000000000000000000000000000000000",
        },
        rawBody: body,
        secret,
      }),
    ).toBe(false);
  });

  it("rejects missing timestamp header", () => {
    const signature = makeSignature(secret, timestamp, body);
    expect(
      verifyChatwootWebhookSignature({
        headers: {
          "x-sapa-signature": signature,
        },
        rawBody: body,
        secret,
      }),
    ).toBe(false);
  });

  it("rejects missing signature header", () => {
    expect(
      verifyChatwootWebhookSignature({
        headers: {
          "x-sapa-timestamp": timestamp,
        },
        rawBody: body,
        secret,
      }),
    ).toBe(false);
  });

  it("skips verification when no secret configured", () => {
    expect(
      verifyChatwootWebhookSignature({
        headers: {},
        rawBody: body,
        secret: "",
      }),
    ).toBe(true);
  });

  it("rejects signature without sha256= prefix", () => {
    const hmac = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    expect(
      verifyChatwootWebhookSignature({
        headers: {
          "x-sapa-timestamp": timestamp,
          "x-sapa-signature": hmac,
        },
        rawBody: body,
        secret,
      }),
    ).toBe(false);
  });
});

describe("isIncomingMessageType", () => {
  it("accepts numeric incoming enum", () => {
    expect(isIncomingMessageType(0)).toBe(true);
  });

  it("accepts numeric string incoming enum", () => {
    expect(isIncomingMessageType("0")).toBe(true);
  });

  it("accepts incoming label from Chatwoot payload", () => {
    expect(isIncomingMessageType("incoming")).toBe(true);
    expect(isIncomingMessageType(" INCOMING ")).toBe(true);
  });

  it("rejects non-incoming message variants", () => {
    expect(isIncomingMessageType(1)).toBe(false);
    expect(isIncomingMessageType("1")).toBe(false);
    expect(isIncomingMessageType("outgoing")).toBe(false);
    expect(isIncomingMessageType(undefined)).toBe(false);
  });
});

describe("resolveChatwootConversationId", () => {
  it("prefers canonical conversation.id when both ids are present", () => {
    expect(
      resolveChatwootConversationId({
        conversation: {
          id: 1696,
          display_id: 1689,
          inbox_id: 9,
          status: "open",
        },
      }),
    ).toBe(1696);
  });

  it("falls back to display_id when id is missing", () => {
    expect(
      resolveChatwootConversationId({
        conversation: {
          id: undefined as unknown as number,
          display_id: 345,
          inbox_id: 9,
          status: "open",
        },
      }),
    ).toBe(345);
  });

  it("returns undefined when both ids are invalid", () => {
    expect(
      resolveChatwootConversationId({
        conversation: {
          id: undefined as unknown as number,
          display_id: undefined as unknown as number,
          inbox_id: 9,
          status: "open",
        },
      }),
    ).toBeUndefined();
  });
});

describe("buildChatwootSessionPeerId", () => {
  it("scopes peer identity by inbox and sender", () => {
    expect(buildChatwootSessionPeerId({ inboxId: "9", senderId: "1658" })).toBe("chatwoot:9:1658");
  });
});
