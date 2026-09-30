// Runs once when the Next.js server starts: pre-load the coach models into
// Ollama so the first review doesn't pay a multi-second model load. Without
// this, the opening move of every session waits for weights to stream in
// before a single token can appear.
const DEFAULT_MODELS = ["gemma2:2b", "qwen2.5:3b"]

async function warmModel(baseUrl: string, model: string): Promise<void> {
  await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      prompt: "warmup",
      stream: false,
      keep_alive: "30m",
      options: { num_predict: 1 },
    }),
  })
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  if ((process.env.LLM_PROVIDER ?? "ollama") !== "ollama") return

  const baseUrl = process.env.OLLAMA_URL ?? "http://localhost:11434"
  const override = process.env.LLM_MODEL?.trim()
  const models = override ? [override] : DEFAULT_MODELS

  // Fire-and-forget: warming must not delay the server from becoming ready.
  void (async () => {
    for (const model of models) {
      try {
        await warmModel(baseUrl, model)
      } catch {
        // Ollama not running (or model missing) — the app degrades the same
        // way it always did; don't block startup on it.
      }
    }
  })()
}
