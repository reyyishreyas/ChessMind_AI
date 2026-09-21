import { NextResponse } from "next/server"

export const maxDuration = 30

// FastAPI backend URL - adjust this to your FastAPI server
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000"

// The ML backend is optional. When it's unreachable we return 200 with
// success:false so the client keeps the current bot ELO — silently, without
// spamming per-request 503s. Log the degradation at most once per few minutes.
let lastFallbackLog = 0

function atMostEvery(ms: number): boolean {
  const now = Date.now()
  if (now - lastFallbackLog > ms) {
    lastFallbackLog = now
    return true
  }
  return false
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    // Forward request to FastAPI backend
    const response = await fetch(`${FASTAPI_URL}/predict-elo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      let errorDetails: string
      try {
        const errorJson = await response.json()
        errorDetails = errorJson.detail || errorJson.error || JSON.stringify(errorJson)
      } catch {
        errorDetails = await response.text()
      }
      if (atMostEvery(120_000)) {
        console.warn("ELO prediction backend returned an error (first seen in a while):", errorDetails)
      }
      return NextResponse.json(
        { error: "ELO prediction failed", details: errorDetails, success: false, predicted_elo: 1200, elo_change: 0, fallback: true },
        { status: 200 }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    // Don't log connection errors - backend might not be running (expected)
    if (error instanceof TypeError && error.message.includes("fetch failed")) {
      if (atMostEvery(120_000)) {
        console.warn("ELO prediction backend not reachable; keeping current bot ELO")
      }
      return NextResponse.json(
        { error: "Backend not available", success: false, predicted_elo: 1200, elo_change: 0, fallback: true },
        { status: 200 }
      )
    }
    // Only log unexpected errors
    console.error("ELO prediction error:", error)
    return NextResponse.json(
      { error: "Failed to predict ELO", details: error instanceof Error ? error.message : String(error), success: false, predicted_elo: 1200, elo_change: 0 },
      { status: 500 }
    )
  }
}

