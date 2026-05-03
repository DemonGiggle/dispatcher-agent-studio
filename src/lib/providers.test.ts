import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { generatePlainText, generateStructuredObject } from "@/lib/providers";

describe("provider execution", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the mock provider when credentials are missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const chunks: string[] = [];
    const result = await generatePlainText({
      selection: {
        provider: "openai",
        model: "gpt-4.1",
        temperature: 0.3,
      },
      system: "You are a dispatcher.",
      prompt: "Plan the work.",
      mock: () => "Mock fallback output",
      onChunk(chunk) {
        chunks.push(chunk);
      },
    });

    expect(result.text).toBe("Mock fallback output");
    expect(chunks.join("")).toBe("Mock fallback output");
    expect(result.meta).toMatchObject({
      requestedProvider: "openai",
      requestedModel: "gpt-4.1",
      effectiveProvider: "mock",
      effectiveModel: "mock:gpt-4.1",
      mode: "mock",
    });
    expect(result.meta.warning).toContain("OPENAI_API_KEY");
  });

  it("preserves structured object generation when it falls back to mock mode", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const result = await generateStructuredObject({
      selection: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        temperature: 0.4,
      },
      system: "You are a planner.",
      prompt: "Return a structured task plan.",
      schema: z.object({
        summary: z.string(),
        tasks: z.array(z.string()),
      }),
      schemaName: "taskPlan",
      mock: () => ({
        summary: "Mock structured plan",
        tasks: ["task-1", "task-2"],
      }),
    });

    expect(result.object).toEqual({
      summary: "Mock structured plan",
      tasks: ["task-1", "task-2"],
    });
    expect(result.meta).toMatchObject({
      requestedProvider: "anthropic",
      requestedModel: "claude-sonnet-4-6",
      effectiveProvider: "mock",
      effectiveModel: "mock:claude-sonnet-4-6",
      mode: "mock",
    });
    expect(result.meta.warning).toContain("ANTHROPIC_API_KEY");
  });

  it("rejects unsupported provider models before execution starts", async () => {
    await expect(
      generatePlainText({
        selection: {
          provider: "google",
          model: "not-a-real-model",
          temperature: 0.3,
        },
        system: "You are a worker.",
        prompt: "Respond once.",
        mock: () => "unused",
      }),
    ).rejects.toMatchObject({
      name: "ProviderExecutionError",
      code: "unsupported-model",
      provider: "google",
      model: "not-a-real-model",
    });
  });

  it("falls back to the mock provider when Ollama is unavailable locally", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));

    const result = await generatePlainText({
      selection: {
        provider: "ollama",
        model: "llama3.2",
        temperature: 0.3,
      },
      system: "You are a local worker.",
      prompt: "Respond once.",
      mock: () => "Mock Ollama fallback",
    });

    expect(result.text).toBe("Mock Ollama fallback");
    expect(result.meta).toMatchObject({
      requestedProvider: "ollama",
      requestedModel: "llama3.2",
      effectiveProvider: "mock",
      effectiveModel: "mock:llama3.2",
      mode: "mock",
    });
    expect(result.meta.warning).toContain("Ollama is not reachable");
  });

  it("rejects Ollama models that are not currently exposed by the local runtime", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: "qwen3:8b" }],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await expect(
      generatePlainText({
        selection: {
          provider: "ollama",
          model: "llama3.2",
          temperature: 0.3,
        },
        system: "You are a local worker.",
        prompt: "Respond once.",
        mock: () => "unused",
      }),
    ).rejects.toMatchObject({
      name: "ProviderExecutionError",
      code: "unsupported-model",
      provider: "ollama",
      model: "llama3.2",
    });
  });
});
