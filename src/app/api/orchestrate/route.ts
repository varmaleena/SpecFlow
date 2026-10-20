import { NextResponse } from 'next/server';
import { env } from '@/lib/server-runtime';
import { orchestrate, parseOrchestrationRequest } from '@/lib/ai';
import { reserveBudget, markCooldown } from '@/lib/quota';
export async function POST(request: Request) {
  try {
    const body = parseOrchestrationRequest(await request.text());
    return NextResponse.json(await orchestrate({ ...body, geminiKey: env.GEMINI_API_KEY, groqKey: env.GROQ_API_KEY, reserveBudget: () => reserveBudget(env.DB), markQuotaExhausted: () => markCooldown(env.DB) }), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? 'Invalid JSON request.' : error instanceof Error ? error.message : 'Invalid request.' }, { status: 400 });
  }
}

