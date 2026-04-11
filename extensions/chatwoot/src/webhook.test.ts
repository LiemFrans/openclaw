import crypto from "node:crypto";
import { describe, it, expect, beforeAll } from "vitest";
import {
  buildChatwootSessionPeerId,
  buildDescriptiveChatwootPeerId,
  isChatwootGroupAllowed,
  isChatwootSenderAllowed,
  isIncomingMessageType,
  resolveChatwootConversationId,
  resolveChatwootGroupCandidates,
  resolveChatwootSenderCandidates,
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

describe("ChatwootConfigSchema – access control", () => {
  // Import lazily to keep static module graph light
  let ChatwootConfigSchema: (typeof import("./config-schema.js"))["ChatwootConfigSchema"];

  beforeAll(async () => {
    ({ ChatwootConfigSchema } = await import("./config-schema.js"));
  });

  it("accepts minimal config and applies defaults", () => {
    const result = ChatwootConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dmPolicy).toBe("open");
      expect(result.data.groupPolicy).toBe("allowlist");
    }
  });

  it("accepts selfChatMode boolean", () => {
    const result = ChatwootConfigSchema.safeParse({ selfChatMode: true });
    expect(result.success).toBe(true);
  });

  it("accepts groupPolicy enum values", () => {
    for (const value of ["open", "disabled", "allowlist"]) {
      const result = ChatwootConfigSchema.safeParse({ groupPolicy: value });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid groupPolicy", () => {
    const result = ChatwootConfigSchema.safeParse({ groupPolicy: "invalid" });
    expect(result.success).toBe(false);
  });

  it("accepts groupAllowFrom with mixed types", () => {
    const result = ChatwootConfigSchema.safeParse({
      groupAllowFrom: ["+15551234567", 42],
    });
    expect(result.success).toBe(true);
  });

  it("accepts groups record with sub-entries", () => {
    const result = ChatwootConfigSchema.safeParse({
      groups: {
        "120363012345678901@g.us": {
          requireMention: true,
          tools: { allow: ["web_search"] },
        },
        "*": {},
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts contextVisibility enum values", () => {
    for (const value of ["all", "allowlist", "allowlist_quote"]) {
      const result = ChatwootConfigSchema.safeParse({ contextVisibility: value });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown fields in strict mode", () => {
    const result = ChatwootConfigSchema.safeParse({ unknownField: true });
    expect(result.success).toBe(false);
  });
});

describe("ChatwootConfigSchema – message delivery", () => {
  let ChatwootConfigSchema: (typeof import("./config-schema.js"))["ChatwootConfigSchema"];

  beforeAll(async () => {
    ({ ChatwootConfigSchema } = await import("./config-schema.js"));
  });

  it("applies debounceMs default of 0", () => {
    const result = ChatwootConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.debounceMs).toBe(0);
    }
  });

  it("accepts blockStreamingCoalesce with all sub-fields", () => {
    const result = ChatwootConfigSchema.safeParse({
      blockStreamingCoalesce: { minChars: 100, maxChars: 2000, idleMs: 500 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects blockStreamingCoalesce with unknown sub-fields", () => {
    const result = ChatwootConfigSchema.safeParse({
      blockStreamingCoalesce: { minChars: 100, unknown: true },
    });
    expect(result.success).toBe(false);
  });

  it("accepts textChunkLimit positive integer", () => {
    const result = ChatwootConfigSchema.safeParse({ textChunkLimit: 4000 });
    expect(result.success).toBe(true);
  });

  it("rejects textChunkLimit zero or negative", () => {
    expect(ChatwootConfigSchema.safeParse({ textChunkLimit: 0 }).success).toBe(false);
    expect(ChatwootConfigSchema.safeParse({ textChunkLimit: -1 }).success).toBe(false);
  });

  it("accepts chunkMode enum values", () => {
    for (const mode of ["length", "newline"]) {
      expect(ChatwootConfigSchema.safeParse({ chunkMode: mode }).success).toBe(true);
    }
  });

  it("rejects invalid chunkMode", () => {
    expect(ChatwootConfigSchema.safeParse({ chunkMode: "words" }).success).toBe(false);
  });

  it("accepts sendReadReceipts boolean", () => {
    expect(ChatwootConfigSchema.safeParse({ sendReadReceipts: true }).success).toBe(true);
    expect(ChatwootConfigSchema.safeParse({ sendReadReceipts: false }).success).toBe(true);
  });

  it("accepts string prefixes", () => {
    const result = ChatwootConfigSchema.safeParse({
      messagePrefix: "[user]",
      responsePrefix: "[bot]",
    });
    expect(result.success).toBe(true);
  });

  it("rejects debounceMs negative", () => {
    expect(ChatwootConfigSchema.safeParse({ debounceMs: -5 }).success).toBe(false);
  });
});

describe("ChatwootConfigSchema – reactions", () => {
  let ChatwootConfigSchema: (typeof import("./config-schema.js"))["ChatwootConfigSchema"];

  beforeAll(async () => {
    ({ ChatwootConfigSchema } = await import("./config-schema.js"));
  });

  it("accepts reactionLevel enum values", () => {
    for (const level of ["off", "ack", "minimal", "extensive"]) {
      expect(ChatwootConfigSchema.safeParse({ reactionLevel: level }).success).toBe(true);
    }
  });

  it("rejects invalid reactionLevel", () => {
    expect(ChatwootConfigSchema.safeParse({ reactionLevel: "full" }).success).toBe(false);
  });

  it("accepts ackReaction with defaults", () => {
    const result = ChatwootConfigSchema.safeParse({ ackReaction: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ackReaction?.direct).toBe(true);
      expect(result.data.ackReaction?.group).toBe("mentions");
    }
  });

  it("accepts ackReaction with all fields", () => {
    const result = ChatwootConfigSchema.safeParse({
      ackReaction: { emoji: "\ud83d\udc40", direct: false, group: "always" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects ackReaction with invalid group value", () => {
    expect(ChatwootConfigSchema.safeParse({ ackReaction: { group: "sometimes" } }).success).toBe(
      false,
    );
  });

  it("rejects ackReaction with unknown sub-fields", () => {
    expect(ChatwootConfigSchema.safeParse({ ackReaction: { unknown: true } }).success).toBe(false);
  });
});

describe("ChatwootConfigSchema – media", () => {
  let ChatwootConfigSchema: (typeof import("./config-schema.js"))["ChatwootConfigSchema"];

  beforeAll(async () => {
    ({ ChatwootConfigSchema } = await import("./config-schema.js"));
  });

  it("applies mediaMaxMb default of 50", () => {
    const result = ChatwootConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mediaMaxMb).toBe(50);
    }
  });

  it("accepts custom mediaMaxMb", () => {
    const result = ChatwootConfigSchema.safeParse({ mediaMaxMb: 100 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mediaMaxMb).toBe(100);
    }
  });

  it("rejects mediaMaxMb zero or negative", () => {
    expect(ChatwootConfigSchema.safeParse({ mediaMaxMb: 0 }).success).toBe(false);
    expect(ChatwootConfigSchema.safeParse({ mediaMaxMb: -10 }).success).toBe(false);
  });
});

describe("ChatwootConfigSchema – session and history", () => {
  let ChatwootConfigSchema: (typeof import("./config-schema.js"))["ChatwootConfigSchema"];

  beforeAll(async () => {
    ({ ChatwootConfigSchema } = await import("./config-schema.js"));
  });

  it("accepts historyLimit non-negative integer", () => {
    expect(ChatwootConfigSchema.safeParse({ historyLimit: 0 }).success).toBe(true);
    expect(ChatwootConfigSchema.safeParse({ historyLimit: 100 }).success).toBe(true);
  });

  it("rejects historyLimit negative", () => {
    expect(ChatwootConfigSchema.safeParse({ historyLimit: -1 }).success).toBe(false);
  });

  it("accepts dmHistoryLimit non-negative integer", () => {
    expect(ChatwootConfigSchema.safeParse({ dmHistoryLimit: 0 }).success).toBe(true);
    expect(ChatwootConfigSchema.safeParse({ dmHistoryLimit: 50 }).success).toBe(true);
  });

  it("rejects dmHistoryLimit negative", () => {
    expect(ChatwootConfigSchema.safeParse({ dmHistoryLimit: -1 }).success).toBe(false);
  });

  it("accepts dms record with DmConfig entries", () => {
    const result = ChatwootConfigSchema.safeParse({
      dms: {
        "user-42": { historyLimit: 20 },
        "user-99": {},
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects dms entry with unknown fields", () => {
    const result = ChatwootConfigSchema.safeParse({
      dms: { "user-1": { unknown: true } },
    });
    expect(result.success).toBe(false);
  });
});

describe("ChatwootConfigSchema – actions and advanced", () => {
  let ChatwootConfigSchema: (typeof import("./config-schema.js"))["ChatwootConfigSchema"];

  beforeAll(async () => {
    ({ ChatwootConfigSchema } = await import("./config-schema.js"));
  });

  it("accepts actions with all sub-fields", () => {
    const result = ChatwootConfigSchema.safeParse({
      actions: { reactions: true, sendMessage: true, polls: false },
    });
    expect(result.success).toBe(true);
  });

  it("rejects actions with unknown sub-fields", () => {
    expect(ChatwootConfigSchema.safeParse({ actions: { unknown: true } }).success).toBe(false);
  });

  it("accepts configWrites boolean", () => {
    expect(ChatwootConfigSchema.safeParse({ configWrites: true }).success).toBe(true);
    expect(ChatwootConfigSchema.safeParse({ configWrites: false }).success).toBe(true);
  });

  it("accepts capabilities string array", () => {
    const result = ChatwootConfigSchema.safeParse({ capabilities: ["vision", "audio"] });
    expect(result.success).toBe(true);
  });

  it("accepts markdown config", () => {
    const result = ChatwootConfigSchema.safeParse({ markdown: { tables: "bullets" } });
    expect(result.success).toBe(true);
  });

  it("rejects markdown with unknown sub-fields", () => {
    expect(ChatwootConfigSchema.safeParse({ markdown: { unknown: true } }).success).toBe(false);
  });

  it("accepts heartbeat config", () => {
    const result = ChatwootConfigSchema.safeParse({
      heartbeat: { showOk: true, showAlerts: false, useIndicator: true },
    });
    expect(result.success).toBe(true);
  });

  it("rejects heartbeat with unknown sub-fields", () => {
    expect(ChatwootConfigSchema.safeParse({ heartbeat: { unknown: true } }).success).toBe(false);
  });

  it("accepts healthMonitor config", () => {
    const result = ChatwootConfigSchema.safeParse({ healthMonitor: { enabled: true } });
    expect(result.success).toBe(true);
  });

  it("rejects healthMonitor with unknown sub-fields", () => {
    expect(ChatwootConfigSchema.safeParse({ healthMonitor: { unknown: true } }).success).toBe(
      false,
    );
  });

  it("actions and configWrites are root-only (not in accounts)", () => {
    const result = ChatwootConfigSchema.safeParse({
      actions: { reactions: true },
      configWrites: true,
      accounts: {
        main: { baseUrl: "https://example.com" },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("resolveChatwootSenderCandidates", () => {
  it("returns empty array for undefined sender", () => {
    expect(resolveChatwootSenderCandidates(undefined)).toEqual([]);
  });

  it("returns numeric contact ID", () => {
    const candidates = resolveChatwootSenderCandidates({ id: 1679 });
    expect(candidates).toContain("1679");
  });

  it("extracts phone number from WAHA JID", () => {
    const candidates = resolveChatwootSenderCandidates({
      id: 1679,
      custom_attributes: {
        waha_whatsapp_jid: "6285156249703@c.us",
      },
    });
    expect(candidates).toContain("6285156249703");
    expect(candidates).toContain("6285156249703@c.us");
  });

  it("extracts phone number from identifier with lid prefix", () => {
    const candidates = resolveChatwootSenderCandidates({
      id: 1658,
      identifier: "lid-6285959823371@c.us",
      custom_attributes: {
        waha_whatsapp_jid: "6285959823371@c.us",
        waha_whatsapp_lid: "4372444528669@lid",
      },
    });
    expect(candidates).toContain("6285959823371");
    expect(candidates).toContain("6285959823371@c.us");
    expect(candidates).toContain("lid-6285959823371@c.us");
    expect(candidates).toContain("1658");
  });

  it("extracts phone from phone_number field", () => {
    const candidates = resolveChatwootSenderCandidates({
      id: 1658,
      phone_number: "+6285959823371",
    });
    expect(candidates).toContain("6285959823371");
  });

  it("does not duplicate phone number from JID and phone_number", () => {
    const candidates = resolveChatwootSenderCandidates({
      id: 1658,
      phone_number: "+6285959823371",
      custom_attributes: {
        waha_whatsapp_jid: "6285959823371@c.us",
      },
    });
    const phoneOccurrences = candidates.filter((c) => c === "6285959823371");
    expect(phoneOccurrences.length).toBe(1);
  });

  it("matches real WAHA webhook payload (identifier null)", () => {
    // Real Chatwoot+WAHA payload: identifier is null, phone comes from JID and phone_number
    const candidates = resolveChatwootSenderCandidates({
      id: 1679,
      name: "Frans",
      phone_number: "+6285156249703",
      identifier: undefined, // null in real Chatwoot payload
      custom_attributes: {
        waha_whatsapp_jid: "6285156249703@c.us",
        waha_whatsapp_lid: "132980810997935@lid",
        waha_whatsapp_chat_id: "132980810997935@lid",
      },
    });
    expect(candidates).toContain("1679");
    expect(candidates).toContain("6285156249703");
    expect(candidates).toContain("6285156249703@c.us");
    // identifier is null so no identifier candidates
    expect(candidates).not.toContain("undefined");
    expect(candidates.every(Boolean)).toBe(true);
  });
});

describe("isChatwootSenderAllowed", () => {
  // Real WAHA+Chatwoot payload: identifier is null, phone from JID + phone_number
  const allowedSender = {
    id: 1658,
    name: "Parkee Frans",
    phone_number: "+6285959823371",
    identifier: undefined as string | undefined, // null in real Chatwoot payload
    custom_attributes: {
      waha_whatsapp_jid: "6285959823371@c.us",
      waha_whatsapp_lid: "4372444528669@lid",
      waha_whatsapp_chat_id: "4372444528669@lid",
    },
  };

  const blockedSender = {
    id: 1679,
    name: "Frans",
    phone_number: "+6285156249703",
    identifier: undefined as string | undefined,
    custom_attributes: {
      waha_whatsapp_jid: "6285156249703@c.us",
      waha_whatsapp_lid: "132980810997935@lid",
      waha_whatsapp_chat_id: "132980810997935@lid",
    },
  };

  it("allows all senders when dmPolicy is open", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "open",
        allowFrom: [],
        sender: blockedSender,
      }),
    ).toBe(true);
  });

  it("blocks all senders when dmPolicy is disabled", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "disabled",
        allowFrom: ["6285959823371"],
        sender: allowedSender,
      }),
    ).toBe(false);
  });

  it("allows sender when phone number matches allowFrom", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "allowlist",
        allowFrom: ["6285959823371"],
        sender: allowedSender,
      }),
    ).toBe(true);
  });

  it("blocks sender when phone number is not in allowFrom", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "allowlist",
        allowFrom: ["6285959823371"],
        sender: blockedSender,
      }),
    ).toBe(false);
  });

  it("allows sender when Chatwoot contact ID matches allowFrom", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "allowlist",
        allowFrom: ["1658"],
        sender: allowedSender,
      }),
    ).toBe(true);
  });

  it("allows sender when full JID matches allowFrom", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "allowlist",
        allowFrom: ["6285959823371@c.us"],
        sender: allowedSender,
      }),
    ).toBe(true);
  });

  it("allows all senders when allowFrom contains wildcard", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "allowlist",
        allowFrom: ["*"],
        sender: blockedSender,
      }),
    ).toBe(true);
  });

  it("blocks all senders when allowlist is empty", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "allowlist",
        allowFrom: [],
        sender: allowedSender,
      }),
    ).toBe(false);
  });

  it("allows when any candidate matches any allowFrom entry", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "allowlist",
        allowFrom: ["6285959823371", "6285156249703"],
        sender: blockedSender,
      }),
    ).toBe(true);
  });

  it("pairing policy blocks with empty allowFrom", () => {
    expect(
      isChatwootSenderAllowed({
        dmPolicy: "pairing",
        allowFrom: [],
        sender: allowedSender,
      }),
    ).toBe(false);
  });
});

describe("resolveChatwootGroupCandidates", () => {
  it("returns empty for undefined sender", () => {
    expect(resolveChatwootGroupCandidates(undefined)).toEqual([]);
  });

  it("returns contact ID for group sender", () => {
    const candidates = resolveChatwootGroupCandidates({
      id: 1666,
      name: "PARKEE Agent General & Production (Group)",
      identifier: "6281380888035-1572323526@g.us",
      custom_attributes: {
        waha_whatsapp_chat_id: "6281380888035-1572323526@g.us",
      },
    });
    // identifier and chat_id are the same, so deduped
    expect(candidates).toEqual(["1666", "6281380888035-1572323526@g.us"]);
  });

  it("includes both identifier and chat_id when different", () => {
    const candidates = resolveChatwootGroupCandidates({
      id: 1670,
      name: "Test Group",
      identifier: "old-group-id@g.us",
      custom_attributes: {
        waha_whatsapp_chat_id: "120363364780250652@g.us",
      },
    });
    expect(candidates).toEqual(["1670", "old-group-id@g.us", "120363364780250652@g.us"]);
  });

  it("handles group with only chat_id (no identifier)", () => {
    const candidates = resolveChatwootGroupCandidates({
      id: 1670,
      name: "Parkee Agent Development (Group)",
      custom_attributes: {
        waha_whatsapp_chat_id: "120363364780250652@g.us",
      },
    });
    expect(candidates).toEqual(["1670", "120363364780250652@g.us"]);
  });

  it("matches real WAHA group payload", () => {
    // From real Chatwoot log: conversation=1710 sender=1670 type=group
    const candidates = resolveChatwootGroupCandidates({
      id: 1670,
      name: "BARBAR (Group)",
      identifier: undefined,
      custom_attributes: {
        waha_whatsapp_chat_id: "6285732931330-1606750208@g.us",
      },
    });
    expect(candidates).toEqual(["1670", "6285732931330-1606750208@g.us"]);
  });
});

describe("isChatwootGroupAllowed", () => {
  const allowedGroup = {
    id: 1666,
    name: "PARKEE Agent General (Group)",
    identifier: "6281380888035-1572323526@g.us",
    custom_attributes: {
      waha_whatsapp_chat_id: "6281380888035-1572323526@g.us",
    },
  };

  const blockedGroup = {
    id: 1670,
    name: "BARBAR (Group)",
    identifier: undefined as string | undefined,
    custom_attributes: {
      waha_whatsapp_chat_id: "6285732931330-1606750208@g.us",
    },
  };

  it("allows all groups when groupPolicy is open", () => {
    expect(
      isChatwootGroupAllowed({
        groupPolicy: "open",
        groupAllowFrom: [],
        sender: blockedGroup,
      }),
    ).toBe(true);
  });

  it("blocks all groups when groupPolicy is disabled", () => {
    expect(
      isChatwootGroupAllowed({
        groupPolicy: "disabled",
        groupAllowFrom: ["6281380888035-1572323526@g.us"],
        sender: allowedGroup,
      }),
    ).toBe(false);
  });

  it("allows group when chat_id matches groupAllowFrom", () => {
    expect(
      isChatwootGroupAllowed({
        groupPolicy: "allowlist",
        groupAllowFrom: ["6281380888035-1572323526@g.us"],
        sender: allowedGroup,
      }),
    ).toBe(true);
  });

  it("blocks group when chat_id is not in groupAllowFrom", () => {
    expect(
      isChatwootGroupAllowed({
        groupPolicy: "allowlist",
        groupAllowFrom: ["6281380888035-1572323526@g.us"],
        sender: blockedGroup,
      }),
    ).toBe(false);
  });

  it("allows group when Chatwoot contact ID matches", () => {
    expect(
      isChatwootGroupAllowed({
        groupPolicy: "allowlist",
        groupAllowFrom: ["1666"],
        sender: allowedGroup,
      }),
    ).toBe(true);
  });

  it("allows all groups when groupAllowFrom contains wildcard", () => {
    expect(
      isChatwootGroupAllowed({
        groupPolicy: "allowlist",
        groupAllowFrom: ["*"],
        sender: blockedGroup,
      }),
    ).toBe(true);
  });

  it("blocks all groups when groupAllowFrom is empty", () => {
    expect(
      isChatwootGroupAllowed({
        groupPolicy: "allowlist",
        groupAllowFrom: [],
        sender: allowedGroup,
      }),
    ).toBe(false);
  });

  it("allows when any candidate matches any groupAllowFrom entry", () => {
    expect(
      isChatwootGroupAllowed({
        groupPolicy: "allowlist",
        groupAllowFrom: ["6281380888035-1572323526@g.us", "6285732931330-1606750208@g.us"],
        sender: blockedGroup,
      }),
    ).toBe(true);
  });
});
