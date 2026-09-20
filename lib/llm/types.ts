export type ProviderName = "ollama" | "gemini" | "groq"

export interface GenerateTextOptions {
  prompt: string
  model: string
  temperature?: number
  maxTokens?: number
}

export interface LLMResult {
  provider: ProviderName
  model: string
  text: string
  latencyMs: number
}

export interface LLMProvider {
  readonly name: ProviderName
  generateText(opts: GenerateTextOptions): Promise<LLMResult>
}