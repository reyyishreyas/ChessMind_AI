import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    "/((?!api/analyze-move|api/llm-test|_next/static|_next/image|favicon.ico|maia3/|stockfish/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|onnx|wasm)$).*)",
  ],
}
