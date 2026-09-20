import { GoogleGenAI } from "@google/genai"
import type { GenerateTextOptions, LLMProvider, LLMResult, ProviderName } from "./types"

export class GeminiProvider implements LLMProvider {
  readonly name: ProviderName = "gemini"

  private ai: GoogleGenAI

  constructor(apiKey: string = process.env.GEMINI_API_KEY ?? "") {
    this.ai = new GoogleGenAI({ apiKey })
  }

  async generateText(opts: GenerateTextOptions): Promise<LLMResult> {
    const startedAt = Date.now()

    const result = await this.ai.models.generateContent({
      model: opts.model,
      contents: opts.prompt,
      config: {
        temperature: opts.temperature ?? 0.2,
        maxOutputTokens: opts.maxTokens,
      },
    })

    return {
      provider: this.name,
      model: opts.model,
      text: result.text ?? "",
      latencyMs: Date.now() - startedAt,
    }
  }
}