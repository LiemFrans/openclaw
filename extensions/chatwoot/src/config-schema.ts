import {
  DmPolicySchema,
  buildChannelConfigSchema,
} from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

export const ChatwootAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    baseUrl: z.string().optional(),
    apiKey: z.string().optional(),
    accountId: z.string().optional(),
    webhookSecret: z.string().optional(),
    dmPolicy: DmPolicySchema.optional().default("open"),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    defaultTo: z.string().optional(),
    blockStreaming: z.boolean().optional(),
  })
  .strict();

export const ChatwootConfigSchema = ChatwootAccountSchemaBase.extend({
  accounts: z.record(z.string(), ChatwootAccountSchemaBase.optional()).optional(),
  defaultAccount: z.string().optional(),
});

export const ChatwootChannelConfigSchema = buildChannelConfigSchema(ChatwootConfigSchema);
