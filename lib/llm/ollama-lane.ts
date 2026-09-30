// Ollama runs requests one at a time (and swaps models between roles), so a
// background suggester arriving just before the player's review used to sit
// ahead of it for minutes (measured: 47-120s feedback latencies). Lanes give
// the app its own arbitration: at most ONE request is in flight to Ollama,
// the player-facing lane ("high") always starts before queued background
// calls ("low"), and same-lane order is FIFO.
//
// Cancellation: a review arriving while a background call runs cancels it —
// background callers treat aborts as best-effort failures and fall back, so
// the review starts immediately instead of waiting out the other request.
//
// The state lives on globalThis: every route bundles its own copy of module
// scope, so a plain module-level singleton would give each route a PRIVATE
// lane (the review could not see — or cancel — a running suggester).
type Task = {
  priority: "high" | "low"
  controller: AbortController
  run: () => Promise<void>
}

type LaneState = {
  high: Task[]
  low: Task[]
  current: Task | null
}

const globalScope = globalThis as typeof globalThis & { __ollamaLane?: LaneState }
const lane: LaneState = (globalScope.__ollamaLane ??= { high: [], low: [], current: null })

function pump(): void {
  if (lane.current) return
  const task = lane.high.shift() ?? lane.low.shift()
  if (!task) return
  lane.current = task
  void task.run().finally(() => {
    lane.current = null
    pump()
  })
}

/**
 * Run `fn` in an Ollama lane. `fn` receives an AbortSignal that fires when a
 * higher-priority caller needs the lane ("high" = player-facing review,
 * "low" = background suggester).
 */
export function withOllamaLane<T>(priority: "high" | "low", fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController()
    const task: Task = {
      priority,
      controller,
      run: () =>
        Promise.resolve()
          .then(() => fn(controller.signal))
          .then(resolve, reject),
    }
    if (priority === "high" && lane.current?.priority === "low") {
      lane.current.controller.abort()
    }
    ;(priority === "high" ? lane.high : lane.low).push(task)
    pump()
  })
}
