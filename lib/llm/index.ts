import { GeminiProvider } from "./gemini"
import { GroqProvider } from "./groq"
import { getWriter, type LLMCallRecord, type LLMCallStatus } from "./logger"
import { OllamaProvider } from "./ollama"
import type { GenerateTextOptions, LLMProvider, LLMResult, ProviderName } from "./types"

const DEFAULT_MODELS: Record<ProviderName, string> = {
  ollama: "gemma2:2b",
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
}

// Optional per-model override, e.g. LLM_MODEL=qwen2.5:1.5b for a snappier local coach.
const MODEL_OVERRIDE = process.env.LLM_MODEL?.trim()

export function resolveModel(provider: LLMProvider): string {
  return MODEL_OVERRIDE ?? DEFAULT_MODELS[provider.name]
}

// Two roles for the coach: one model critiques the player's move (feedback),
// another picks and explains the move to play (suggester). They share the
// coach_context row so each sees what the other said.
const COACH_MODELS: Record<ProviderName, { feedback: string; suggester: string }> = {
  ollama: { feedback: "gemma2:2b", suggester: "qwen2.5:3b" },
  gemini: { feedback: "gemini-2.5-flash", suggester: "gemini-2.5-flash" },
  groq: { feedback: "llama-3.3-70b-versatile", suggester: "llama-3.3-70b-versatile" },
}

export type CoachRole = "feedback" | "suggester"

export function resolveCoachModel(provider: LLMProvider, role: CoachRole): string {
  if (MODEL_OVERRIDE) return MODEL_OVERRIDE
  return COACH_MODELS[provider.name][role]
}

export function getProvider(name?: string): LLMProvider {
  const providerName = (name ?? process.env.LLM_PROVIDER ?? "ollama") as ProviderName

  switch (providerName) {
    case "ollama":
      return new OllamaProvider()
    case "gemini":
      return new GeminiProvider()
    case "groq":
      return new GroqProvider()
    default:
      throw new Error(`Unknown provider: "${providerName}"`)
  }
}

export function extractJSON<T>(text: string): T {
  let t = text.trim()

  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (fence) t = fence[1].trim()

  try {
    return JSON.parse(t) as T
  } catch {
    const match = t.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("No JSON object found in model output")
    return JSON.parse(match[0]) as T
  }
}

export async function generateJSON<T>(
  opts: Omit<GenerateTextOptions, "model"> & {
    model?: string
    provider?: LLMProvider
    attempts?: number
    promptVersion?: string
    meta?: LLMCallRecord["meta"]
  },
): Promise<{ data: T; result: LLMResult }> {
  const provider = opts.provider ?? getProvider()
  const model = opts.model ?? MODEL_OVERRIDE ?? DEFAULT_MODELS[provider.name]
  const attempts = opts.attempts ?? 2
  const writer = getWriter()

  let lastStatus: LLMCallStatus = "api_error"
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const result = await provider.generateText({
        prompt: opts.prompt,
        model,
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      })

      let data: T
      try {
        data = extractJSON<T>(result.text)
      } catch (parseErr) {
        const e = new Error(`JSON parse failed on attempt ${attempt}: ${(parseErr as Error).message}`)
        ;(e as Error & { parseError?: boolean }).parseError = true
        throw e
      }

      await writer.write({
        ts: new Date().toISOString(),
        provider: provider.name,
        model,
        latencyMs: result.latencyMs,
        promptVersion: opts.promptVersion,
        parseCount: attempt,
        status: "ok",
        prompt: opts.prompt,
        data: data ?? undefined,
        meta: opts.meta,
      })

      return { data, result }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      lastStatus = (err as Error & { parseError?: boolean }).parseError ? "parse_error" : "api_error"
    }
  }

  await writer.write({
    ts: new Date().toISOString(),
    provider: provider.name,
    model,
    latencyMs: 0,
    promptVersion: opts.promptVersion,
    parseCount: attempts,
    status: lastStatus,
    error: lastError?.message,
    prompt: opts.prompt,
  })

  throw lastError
}