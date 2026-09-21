import { appendFile } from "node:fs/promises"
import path from "node:path"
import { insertLlmCall } from "@/lib/db/db"
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
  /** Parsed model response, when available. */
  data?: unknown
  /** Structured call context (e.g. recorded FEN) for replay validation. */
  meta?: { fen?: string; fenBefore?: string; [key: string]: unknown }
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

export class SqliteWriter implements LLMCallWriter {
  async write(record: LLMCallRecord): Promise<void> {
    insertLlmCall({
      provider: record.provider,
      model: record.model,
      prompt_version: record.promptVersion,
      status: record.status,
      latency_ms: Math.round(record.latencyMs),
      parse_count: record.parseCount,
      error: record.error,
      prompt: record.prompt,
      data: record.data,
      meta: record.meta,
    })
  }
}

export function getWriter(): LLMCallWriter {
  return new SqliteWriter()
}