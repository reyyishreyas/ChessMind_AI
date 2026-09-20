import type { GenerateTextOptions, LLMProvider, LLMResult, ProviderName } from "./types"

export class OllamaProvider implements LLMProvider {
  readonly name: ProviderName = "ollama"

  constructor(private readonly baseUrl: string = process.env.OLLAMA_URL ?? "http://localhost:11434") {}

  async generateText(opts: GenerateTextOptions): Promise<LLMResult> {
    const startedAt = Date.now()

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model,
        prompt: opts.prompt,
        stream: false,
        format: "json",
        options: {
          temperature: opts.temperature ?? 0.2,
          num_predict: opts.maxTokens ?? 2048,
        },
      }),
    })

    if (!res.ok) {
      throw new Error(`Ollama request failed (${res.status}): ${await res.text()}`)
    }

    const data = (await res.json()) as { response: string }
    return {
      provider: this.name,
      model: opts.model,
      text: data.response,
      latencyMs: Date.now() - startedAt,
    }
  }
}