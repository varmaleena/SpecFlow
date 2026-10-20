import { hashToken } from './wispr-crypto';
interface Statement { bind(...args: (string | number)[]): Statement; first<T>(): Promise<T | null>; run(): Promise<{ meta: { changes: number } }> }
export interface DeliveryStore { prepare(sql: string): Statement }
export async function deliverWebhook(input: { url: string; text: string; version: number }, db: DeliveryStore | undefined, fetcher: typeof fetch = fetch) {
  const url = new URL(input.url);
  if (url.protocol !== 'https:' || !['hooks.slack.com', 'discord.com', 'discordapp.com'].includes(url.hostname) || !/^\/(services|api\/webhooks)\//.test(url.pathname)) return { status: 400, body: { error: 'Use a valid Slack or Discord webhook.' } };
  if (!input.text.trim() || input.text.length > 12000 || !Number.isInteger(input.version) || input.version < 1 || input.version > 9999) return { status: 400, body: { error: 'Provide an announcement and a valid plan version.' } };
  const discord = url.hostname !== 'hooks.slack.com';
  if (discord && input.text.length > 2000) return { status: 400, body: { error: 'Discord announcements must be under 2,000 characters. Shorten the displayed draft before confirming.' } };
  if (!db) return { status: 503, body: { error: 'Delivery tracking is unavailable. No message was sent.' } };
  const id = await hashToken(JSON.stringify([input.url, input.text, input.version]));
  const inserted = await db.prepare('INSERT INTO delivery_attempts (id, state, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id, 'pending', Math.floor(Date.now() / 1000)).run();
  if (inserted.meta.changes !== 1) {
    const previous = await db.prepare('SELECT state FROM delivery_attempts WHERE id = ?').bind(id).first<{ state: string }>();
    if (previous?.state === 'sent') return { status: 200, body: { ok: true, duplicate: true, receiptId: id } };
    if (previous?.state !== 'failed') return { status: 409, body: { error: 'A previous delivery is pending or could not be confirmed. Check your destination before trying a new announcement.' } };
    const retry = await db.prepare('UPDATE delivery_attempts SET state = ? WHERE id = ? AND state = ?').bind('pending', id, 'failed').run();
    if (retry.meta.changes !== 1) return { status: 409, body: { error: 'This announcement is already being processed.' } };
  }
  try {
    const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(discord ? { content: input.text } : { text: input.text }), redirect: 'error', signal: AbortSignal.timeout(8000) });
    const state = response.ok ? 'sent' : response.status >= 500 ? 'unknown' : 'failed';
    await db.prepare('UPDATE delivery_attempts SET state = ? WHERE id = ?').bind(state, id).run();
    if (!response.ok) return { status: 502, body: { error: state === 'unknown' ? 'The destination returned an uncertain result. Check it before sending again.' : 'The destination rejected this announcement. Check the webhook and permissions.' } };
    return { status: 200, body: { ok: true, duplicate: false, receiptId: id } };
  } catch {
    await db.prepare('UPDATE delivery_attempts SET state = ? WHERE id = ?').bind('unknown', id).run().catch(() => {});
    return { status: 502, body: { error: 'Delivery could not be confirmed. Check the destination before retrying; this announcement will not be replayed automatically.' } };
  }
}
