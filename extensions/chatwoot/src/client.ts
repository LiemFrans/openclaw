import type { ChatwootAttachment } from "./types.js";

export type ChatwootSendMessageResult = {
  id: number;
  content?: string;
  message_type?: string;
  created_at?: string;
};

export type ChatwootSendMessageOptions = {
  contentType?: string;
  private?: boolean;
  messageType?: "outgoing" | "incoming";
};

/**
 * Minimal Chatwoot/Sapa REST API client.
 * Uses the Agent Bot access token for authentication.
 */
export class ChatwootClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(params: { baseUrl: string; apiKey: string }) {
    this.baseUrl = params.baseUrl.replace(/\/+$/, "");
    this.apiKey = params.apiKey;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      api_access_token: this.apiKey,
    };
  }

  private url(path: string): string {
    return `${this.baseUrl}/api/v1${path}`;
  }

  async sendMessage(
    chatwootAccountId: string,
    conversationId: number,
    content: string,
    options?: ChatwootSendMessageOptions,
  ): Promise<ChatwootSendMessageResult> {
    const body: Record<string, unknown> = {
      content,
      message_type: options?.messageType ?? "outgoing",
      content_type: options?.contentType ?? "text",
    };
    if (options?.private !== undefined) {
      body.private = options.private;
    }

    const response = await fetch(
      this.url(`/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`),
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Chatwoot API error ${response.status}: ${text || response.statusText}`);
    }

    return (await response.json()) as ChatwootSendMessageResult;
  }

  async sendMediaMessage(
    chatwootAccountId: string,
    conversationId: number,
    filePath: string,
    caption?: string,
  ): Promise<ChatwootSendMessageResult> {
    const { readFile } = await import("node:fs/promises");
    const { basename } = await import("node:path");

    const fileName = basename(filePath);
    const fileBuffer = await readFile(filePath);
    const fileBlob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append("attachments[]", fileBlob, fileName);
    formData.append("message_type", "outgoing");
    if (caption) {
      formData.append("content", caption);
    }

    const response = await fetch(
      this.url(`/accounts/${chatwootAccountId}/conversations/${conversationId}/messages`),
      {
        method: "POST",
        headers: { api_access_token: this.apiKey },
        body: formData,
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Chatwoot media upload error ${response.status}: ${text || response.statusText}`,
      );
    }

    return (await response.json()) as ChatwootSendMessageResult;
  }

  /**
   * Download an attachment from a Chatwoot data_url.
   * Returns the raw Response for streaming.
   */
  async downloadAttachment(attachment: ChatwootAttachment): Promise<Response> {
    const url = attachment.data_url.startsWith("http")
      ? attachment.data_url
      : `${this.baseUrl}${attachment.data_url}`;

    const response = await fetch(url, {
      headers: { api_access_token: this.apiKey },
    });

    if (!response.ok) {
      throw new Error(
        `Chatwoot attachment download error ${response.status}: ${response.statusText}`,
      );
    }

    return response;
  }
}
