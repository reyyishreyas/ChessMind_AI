import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// Offline mode: there is no auth server. Every request acts as the fixed
// local persona (lib/db). This middleware is a pure passthrough — kept so the
// static-asset exclusions below stay centralized if middleware is needed later.
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!api/analyze-move|api/llm-test|_next/static|_next/image|favicon.ico|maia3/|stockfish/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|onnx|wasm)$).*)",
  ],
}