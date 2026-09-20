import type { GenerateTextOptions, LLMProvider, LLMResult, ProviderName } from "./types"

export class GroqProvider implements LLMProvider {
  readonly name: ProviderName = "groq"

  constructor(
    private readonly apiKey: string = process.env.GROQ_API_KEY ?? "",
    private readonly baseUrl: string = "https://api.groq.com/openai/v1",
  ) {}

  async generateText(opts: GenerateTextOptions): Promise<LLMResult> {
    const startedAt = Date.now()

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: [{ role: "user", content: opts.prompt }],
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 2048,
      }),
    })

    if (!res.ok) {
      throw new Error(`Groq request failed (${res.status}): ${await res.text()}`)
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    return {
      provider: this.name,
      model: opts.model,
      text: data.choices?.[0]?.message?.content ?? "",
      latencyMs: Date.now() - startedAt,
    }
  }
}