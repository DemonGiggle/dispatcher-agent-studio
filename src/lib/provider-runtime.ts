import type { ModelCatalogEntry } from "@/lib/model-catalog";

export const OLLAMA_DEFAULT_BASE_URL = "http://127.0.0.1:11434/v1";

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function getOllamaBaseURL(): string {
  const configuredBaseUrl = process.env.OLLAMA_BASE_URL?.trim();
  return configuredBaseUrl?.length ? configuredBaseUrl : OLLAMA_DEFAULT_BASE_URL;
}

export function getOllamaApiKey(): string | undefined {
  const configuredApiKey = process.env.OLLAMA_API_KEY?.trim();
  return configuredApiKey?.length ? configuredApiKey : undefined;
}

export function getOllamaModelsURL(baseURL = getOllamaBaseURL()): string {
  return new URL("models", ensureTrailingSlash(baseURL)).toString();
}

export async function fetchOllamaModels({
  fetchImpl = fetch,
  signal,
}: {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<ModelCatalogEntry[]> {
  const apiKey = getOllamaApiKey();
  const response = await fetchImpl(getOllamaModelsURL(), {
    method: "GET",
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Ollama model endpoint returned ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: unknown }>;
  };

  const seen = new Set<string>();
  const models: ModelCatalogEntry[] = [];

  for (const entry of payload.data ?? []) {
    if (typeof entry.id !== "string") {
      continue;
    }

    const modelId = entry.id.trim();

    if (!modelId || seen.has(modelId)) {
      continue;
    }

    seen.add(modelId);
    models.push({
      id: modelId,
      label: modelId,
      description: "Discovered from the local Ollama runtime.",
    });
  }

  return models.sort((left, right) => left.label.localeCompare(right.label));
}
