import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/health/route";

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const originalOllamaBaseUrl = process.env.OLLAMA_BASE_URL;

describe("GET /api/health", () => {
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleKey;
    process.env.OLLAMA_BASE_URL = originalOllamaBaseUrl;
    vi.restoreAllMocks();
  });

  it("returns runtime health and configured provider readiness", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "llama3.2" }] }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }),
    );

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload).toMatchObject({
      status: "ok",
      service: "dispatcher-agent-studio",
      deploymentTarget: "vercel",
      runtime: "nodejs",
      schemaVersion: 2,
      checks: {
        mockFallbackAvailable: true,
        configuredLiveProviders: 2,
        allProviderEntriesPresent: true,
      },
      providers: {
        mock: {
          configured: true,
          status: "mock",
        },
        ollama: {
          configured: true,
          status: "configured",
        },
        openai: {
          configured: true,
          status: "configured",
        },
        anthropic: {
          configured: false,
          status: "missing-key",
        },
        google: {
          configured: false,
          status: "missing-key",
        },
      },
    });
  });
});
