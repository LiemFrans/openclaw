import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatwootClient } from "./client.js";

let mockFetch: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("ChatwootClient", () => {
  const client = new ChatwootClient({
    baseUrl: "https://chatwoot.example.com",
    apiKey: "test-token",
  });

  describe("sendMessage", () => {
    it("sends a text message to correct endpoint", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 123, content: "Hello" }),
      });

      const result = await client.sendMessage("1", 42, "Hello");
      expect(result.id).toBe(123);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://chatwoot.example.com/api/v1/accounts/1/conversations/42/messages");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body as string)).toEqual({
        content: "Hello",
        message_type: "outgoing",
        content_type: "text",
      });
      expect((opts.headers as Record<string, string>).api_access_token).toBe("test-token");
    });

    it("throws on API error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => "access denied",
      });

      await expect(client.sendMessage("1", 42, "Hello")).rejects.toThrow("Chatwoot API error 403");
    });

    it("strips trailing slashes from base URL", () => {
      const c = new ChatwootClient({
        baseUrl: "https://chatwoot.example.com///",
        apiKey: "tok",
      });
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      });

      void c.sendMessage("1", 1, "test");
      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://chatwoot.example.com/api/v1/accounts/1/conversations/1/messages");
    });
  });

  describe("downloadAttachment", () => {
    it("fetches attachment with auth header", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
      });

      await client.downloadAttachment({
        id: 1,
        message_id: 2,
        file_type: "image",
        account_id: 1,
        data_url: "https://chatwoot.example.com/rails/active_storage/blobs/file.png",
      });

      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://chatwoot.example.com/rails/active_storage/blobs/file.png");
      expect((opts.headers as Record<string, string>).api_access_token).toBe("test-token");
    });

    it("prepends base URL for relative data_url", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      await client.downloadAttachment({
        id: 1,
        message_id: 2,
        file_type: "file",
        account_id: 1,
        data_url: "/rails/active_storage/blobs/file.pdf",
      });

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://chatwoot.example.com/rails/active_storage/blobs/file.pdf");
    });

    it("throws on download error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(
        client.downloadAttachment({
          id: 1,
          message_id: 2,
          file_type: "image",
          account_id: 1,
          data_url: "https://chatwoot.example.com/missing.png",
        }),
      ).rejects.toThrow("Chatwoot attachment download error 404");
    });
  });
});
