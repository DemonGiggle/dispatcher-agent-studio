import { afterEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/health/route";

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalGoogleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

describe("GET /api/health", () => {
  afterEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
    process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleKey;
  });

  it("returns runtime health and configured provider readiness", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.ANTHROPIC_API_KEY = "";
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

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
        configuredLiveProviders: 1,
        allProviderEntriesPresent: true,
      },
      providers: {
        mock: {
          configured: true,
          status: "mock",
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
