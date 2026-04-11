import {
  AllowFromListSchema,
  BlockStreamingCoalesceSchema,
  ContextVisibilityModeSchema,
  DmPolicySchema,
  GroupPolicySchema,
  ToolPolicySchema,
  buildChannelConfigSchema,
} from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "openclaw/plugin-sdk/zod";

const ToolPolicyBySenderSchema = z.record(z.string(), ToolPolicySchema).optional();

const ChatwootAckReactionSchema = z
  .object({
    emoji: z.string().optional(),
    direct: z.boolean().optional().default(true),
    group: z.enum(["always", "mentions", "never"]).optional().default("mentions"),
  })
  .strict()
  .optional();

const ChatwootGroupEntrySchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    toolsBySender: ToolPolicyBySenderSchema,
  })
  .strict()
  .optional();

const ChatwootGroupsSchema = z.record(z.string(), ChatwootGroupEntrySchema).optional();

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
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    debounceMs: z.number().int().nonnegative().optional().default(0),
    sendReadReceipts: z.boolean().optional(),
    messagePrefix: z.string().optional(),
    responsePrefix: z.string().optional(),
    reactionLevel: z.enum(["off", "ack", "minimal", "extensive"]).optional(),
    ackReaction: ChatwootAckReactionSchema,
    mediaMaxMb: z.number().positive().optional().default(50),
    selfChatMode: z.boolean().optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    groupAllowFrom: AllowFromListSchema,
    groups: ChatwootGroupsSchema,
    contextVisibility: ContextVisibilityModeSchema.optional(),
  })
  .strict();

export const ChatwootConfigSchema = ChatwootAccountSchemaBase.extend({
  accounts: z.record(z.string(), ChatwootAccountSchemaBase.optional()).optional(),
  defaultAccount: z.string().optional(),
});

export const ChatwootChannelConfigSchema = buildChannelConfigSchema(ChatwootConfigSchema);
