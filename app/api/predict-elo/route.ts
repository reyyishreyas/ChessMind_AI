import { NextResponse } from "next/server"

export const maxDuration = 30

// FastAPI backend URL - adjust this to your FastAPI server
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8000"

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
      // Don't log connection errors - backend might not be running (expected)
      if (!errorDetails.includes("ECONNREFUSED") && !errorDetails.includes("fetch failed")) {
        console.error("FastAPI error:", errorDetails)
      }
      return NextResponse.json(
        { error: "ELO prediction failed", details: errorDetails, success: false, predicted_elo: 1200, elo_change: 0 },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    // Don't log connection errors - backend might not be running (expected behavior)
    if (error instanceof TypeError && error.message.includes("fetch failed")) {
      // Backend not available - return error response but don't log
      return NextResponse.json(
        { error: "Backend not available", success: false, predicted_elo: 1200, elo_change: 0 },
        { status: 503 }
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

