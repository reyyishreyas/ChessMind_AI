import { appendFile } from "node:fs/promises"
import path from "node:path"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import type { ProviderName } from "./types"

export type LLMCallStatus = "ok" | "parse_error" | "api_error"

export interface LLMCallRecord {
  ts: string
  provider: ProviderName
  model: string
  latencyMs: number
  promptVersion?: string
  status: LLMCallStatus
  parseCount?: number
  error?: string
  prompt?: string
}

export interface LLMCallWriter {
  write(record: LLMCallRecord): Promise<void>
}

export class JsonlWriter implements LLMCallWriter {
  constructor(private readonly filePath: string = path.join(process.cwd(), ".llm-calls.ndjson")) {}

  async write(record: LLMCallRecord): Promise<void> {
    await appendFile(this.filePath, JSON.stringify(record) + "\n", "utf8")
  }
}

export class SupabaseWriter implements LLMCallWriter {
  private client: ReturnType<typeof createSupabaseClient>

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) throw new Error("Supabase not configured for llm_calls logging")
    this.client = createSupabaseClient(url, key)
  }

  async write(record: LLMCallRecord): Promise<void> {
    const builder = this.client.from("llm_calls") as unknown as {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
    }

    const { error } = await builder.insert({
      provider: record.provider,
      model: record.model,
      prompt_version: record.promptVersion,
      status: record.status,
      latency_ms: Math.round(record.latencyMs),
      parse_count: record.parseCount,
      error: record.error,
      prompt: record.prompt,
    })
    if (error) throw new Error(error.message)
  }
}

export function getWriter(): LLMCallWriter {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      return new SupabaseWriter()
    } catch {
      // fall through to local file
    }
  }
  return new JsonlWriter()
}