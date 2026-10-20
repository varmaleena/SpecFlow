import { NextResponse } from 'next/server';
import { env } from '@/lib/server-runtime';
import { deliverWebhook } from '@/lib/delivery';
import { APP_ORIGIN } from '@/lib/wispr-server';
export async function POST(request: Request) {
  try {
    if (request.headers.get('origin') !== APP_ORIGIN) return NextResponse.json({ error: 'Start delivery from SpecFlow.' }, { status: 403 });
    const raw = await request.text(); if (raw.length > 20000) return NextResponse.json({ error: 'Request too large.' }, { status: 400 });
    const body = JSON.parse(raw) as { url?: unknown; text?: unknown; version?: unknown };
    if (typeof body.url !== 'string' || typeof body.text !== 'string') return NextResponse.json({ error: 'Provide a webhook and announcement.' }, { status: 400 });
    const result = await deliverWebhook({ url: body.url, text: body.text, version: typeof body.version === 'number' ? body.version : 1 }, env.DB);
    return NextResponse.json(result.body, { status: result.status, headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Delivery could not complete. No automatic retry will be attempted.' }, { status: 400 }); }
}

