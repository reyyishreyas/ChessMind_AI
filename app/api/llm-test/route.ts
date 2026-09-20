import { generateJSON, getProvider } from "@/lib/llm"

export const dynamic = "force-dynamic"

export async function GET() {
  const provider = getProvider()

  const { data, result } = await generateJSON<{
    castling_reason: string
    advice: string
  }>({
    prompt:
      "You are a friendly chess coach. A beginner asks: 'Why should I castle early?' " +
      'Reply with JSON: {"castling_reason": "one short reason", "advice": "one specific piece of advice"}',
  })

  return Response.json({
    provider: provider.name,
    model: result.model,
    latencyMs: result.latencyMs,
    data,
  })
}