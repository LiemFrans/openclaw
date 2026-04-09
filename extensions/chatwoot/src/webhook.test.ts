import crypto from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyChatwootWebhookSignature } from "./webhook.js";

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
