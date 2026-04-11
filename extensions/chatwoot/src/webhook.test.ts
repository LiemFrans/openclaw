import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  buildChatwootSessionPeerId,
  buildDescriptiveChatwootPeerId,
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

describe("buildDescriptiveChatwootPeerId", () => {
  it("builds DM peer ID from WAHA WhatsApp lid+jid", () => {
    expect(
      buildDescriptiveChatwootPeerId({
        inboxId: "9",
        conversationId: 1702,
        sender: {
          id: 1658,
          name: "Parkee Frans",
          phone_number: "+6285959823371",
          custom_attributes: {
            waha_whatsapp_jid: "6285959823371@c.us",
            waha_whatsapp_lid: "4372444528669@lid",
            waha_whatsapp_chat_id: "4372444528669@lid",
          },
        },
        inboxName: "Whatsapp Api Cici",
      }),
    ).toBe("chatwoot:whatsapp-4372444528669@lid-6285959823371@c.us-Parkee Frans");
  });

  it("builds group peer ID from WAHA WhatsApp group identifier", () => {
    expect(
      buildDescriptiveChatwootPeerId({
        inboxId: "9",
        conversationId: 1689,
        sender: {
          id: 1666,
          name: "PARKEE Agent General & Production (Group)",
          identifier: "6281380888035-1572323526@g.us",
          custom_attributes: {
            waha_whatsapp_chat_id: "6281380888035-1572323526@g.us",
          },
        },
        inboxName: "Whatsapp Api Cici",
      }),
    ).toBe(
      "chatwoot:whatsapp-6281380888035-1572323526@g.us-PARKEE Agent General & Production (Group)",
    );
  });

  it("falls back to group identifier from custom_attributes when identifier is missing", () => {
    expect(
      buildDescriptiveChatwootPeerId({
        inboxId: "9",
        conversationId: 1694,
        sender: {
          id: 1670,
          name: "Parkee Agent Development (Group)",
          custom_attributes: {
            waha_whatsapp_chat_id: "120363364780250652@g.us",
          },
        },
      }),
    ).toBe("chatwoot:whatsapp-120363364780250652@g.us-Parkee Agent Development (Group)");
  });

  it("builds DM peer ID with jid only when lid is missing", () => {
    expect(
      buildDescriptiveChatwootPeerId({
        inboxId: "9",
        conversationId: 1700,
        sender: {
          id: 1680,
          name: "John Doe",
          custom_attributes: {
            waha_whatsapp_jid: "6281234567890@c.us",
          },
        },
      }),
    ).toBe("chatwoot:whatsapp--6281234567890@c.us-John Doe");
  });

  it("falls back to inbox:conversationId when no WAHA attributes", () => {
    expect(
      buildDescriptiveChatwootPeerId({
        inboxId: "9",
        conversationId: 1700,
        sender: { id: 1680, name: "Test User" },
        inboxName: "Email Support",
      }),
    ).toBe("chatwoot:9:1700");
  });

  it("falls back to inbox:conversationId when sender is missing", () => {
    expect(
      buildDescriptiveChatwootPeerId({
        inboxId: "9",
        conversationId: 1700,
      }),
    ).toBe("chatwoot:9:1700");
  });

  it("derives channel name from inbox name when no WAHA attributes but has non-whatsapp custom_attributes", () => {
    expect(
      buildDescriptiveChatwootPeerId({
        inboxId: "5",
        conversationId: 500,
        sender: {
          id: 100,
          name: "Someone",
          custom_attributes: { some_other_attr: "value" },
        },
        inboxName: "Telegram Bot",
      }),
    ).toBe("chatwoot:5:500");
  });
});
