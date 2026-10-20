import { NextResponse } from 'next/server';
import { env } from '@/lib/server-runtime';
export const dynamic = 'force-dynamic';
export function GET() { return NextResponse.json({ configured: !!env.GEMINI_API_KEY, model: 'gemini-3.1-flash-lite', dailyCap: 30, minuteCap: 3 }, { headers: { 'Cache-Control': 'no-store' } }); }

