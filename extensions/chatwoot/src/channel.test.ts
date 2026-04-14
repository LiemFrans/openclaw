import { describe, it, expect } from "vitest";
import {
  resolveChatwootAccount,
  normalizeChatwootBaseUrl,
  isChatwootConfigured,
} from "./accounts.js";
import type { CoreConfig } from "./types.js";

function makeCfg(chatwoot?: Record<string, unknown>): CoreConfig {
  return { channels: { chatwoot } } as CoreConfig;
}

describe("resolveChatwootAccount", () => {
  it("resolves account from config", () => {
    const cfg = makeCfg({
      baseUrl: "https://chatwoot.example.com",
      apiKey: "test-api-key",
      accountId: "42",
    });
    const account = resolveChatwootAccount({ cfg });
    expect(account.configured).toBe(true);
    expect(account.baseUrl).toBe("https://chatwoot.example.com");
    expect(account.apiKey).toBe("test-api-key");
    expect(account.chatwootAccountId).toBe("42");
    expect(account.enabled).toBe(true);
  });

  it("reports not configured when apiKey is missing", () => {
    const cfg = makeCfg({
      baseUrl: "https://chatwoot.example.com",
      accountId: "42",
    });
    const account = resolveChatwootAccount({ cfg });
    expect(account.configured).toBe(false);
  });

  it("reports not configured when baseUrl is missing", () => {
    const cfg = makeCfg({
      apiKey: "test-api-key",
      accountId: "42",
    });
    const account = resolveChatwootAccount({ cfg });
    expect(account.configured).toBe(false);
  });

  it("reports not configured when accountId is missing", () => {
    const cfg = makeCfg({
      baseUrl: "https://chatwoot.example.com",
      apiKey: "test-api-key",
    });
    const account = resolveChatwootAccount({ cfg });
    expect(account.configured).toBe(false);
  });

  it("reports not configured when channels section is empty", () => {
    const cfg = makeCfg();
    const account = resolveChatwootAccount({ cfg });
    expect(account.configured).toBe(false);
    expect(account.baseUrl).toBe("");
    expect(account.apiKey).toBe("");
  });

  it("respects enabled=false", () => {
    const cfg = makeCfg({
      baseUrl: "https://chatwoot.example.com",
      apiKey: "test-api-key",
      accountId: "42",
      enabled: false,
    });
    const account = resolveChatwootAccount({ cfg });
    expect(account.enabled).toBe(false);
    expect(account.configured).toBe(true);
  });

  it("strips trailing slashes from baseUrl", () => {
    const cfg = makeCfg({
      baseUrl: "https://chatwoot.example.com///",
      apiKey: "test-api-key",
      accountId: "1",
    });
    const account = resolveChatwootAccount({ cfg });
    expect(account.baseUrl).toBe("https://chatwoot.example.com");
  });

  it("resolves webhookSecret from config", () => {
    const cfg = makeCfg({
      baseUrl: "https://chatwoot.example.com",
      apiKey: "key",
      accountId: "1",
      webhookSecret: "my-secret",
    });
    const account = resolveChatwootAccount({ cfg });
    expect(account.webhookSecret).toBe("my-secret");
  });
});

describe("normalizeChatwootBaseUrl", () => {
  it("adds https:// prefix if missing", () => {
    expect(normalizeChatwootBaseUrl("chatwoot.example.com")).toBe("https://chatwoot.example.com");
  });

  it("keeps http:// prefix", () => {
    expect(normalizeChatwootBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("strips trailing slashes", () => {
    expect(normalizeChatwootBaseUrl("https://chatwoot.example.com/")).toBe(
      "https://chatwoot.example.com",
    );
  });

  it("returns empty string for empty input", () => {
    expect(normalizeChatwootBaseUrl("")).toBe("");
    expect(normalizeChatwootBaseUrl(undefined)).toBe("");
  });
});

describe("isChatwootConfigured", () => {
  it("returns true when all required fields present", () => {
    const account = resolveChatwootAccount({
      cfg: makeCfg({
        baseUrl: "https://chatwoot.example.com",
        apiKey: "key",
        accountId: "1",
      }),
    });
    expect(isChatwootConfigured(account)).toBe(true);
  });

  it("returns false when fields missing", () => {
    const account = resolveChatwootAccount({ cfg: makeCfg() });
    expect(isChatwootConfigured(account)).toBe(false);
  });
});
