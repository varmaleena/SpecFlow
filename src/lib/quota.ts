import type { AiBudget } from './ai';
export const DAILY_AI_CAP = 30;
export const MINUTE_AI_CAP = 3;
interface Statement {
  bind(...values: (string | number)[]): Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface BudgetStore { prepare(sql: string): Statement }
export async function reserveBudget(db: BudgetStore | undefined, now = Math.floor(Date.now() / 1000)): Promise<AiBudget> {
  if (!db) return { allowed: false, reason: 'budget_unavailable' };
  const cooldown = await db.prepare('SELECT expires_at FROM ai_usage WHERE bucket = ? AND expires_at > ?').bind('provider-cooldown', now).first<{ expires_at: number }>();
  if (cooldown) return { allowed: false, reason: 'provider_quota' };
  await db.prepare('DELETE FROM ai_usage WHERE expires_at < ?').bind(now - 86400).run();
  const sql = 'INSERT INTO ai_usage (bucket, used, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used';
  const minute = await db.prepare(sql).bind(`minute:${Math.floor(now / 60)}`, now + 120, MINUTE_AI_CAP).first<{ used: number }>();
  if (!minute) return { allowed: false, reason: 'minute_limit' };
  const day = await db.prepare(sql).bind(`day:${Math.floor(now / 86400)}`, (Math.floor(now / 86400) + 1) * 86400, DAILY_AI_CAP).first<{ used: number }>();
  if (!day) return { allowed: false, reason: 'daily_limit', remaining: 0 };
  return { allowed: true, remaining: DAILY_AI_CAP - day.used };
}
export async function markCooldown(db: BudgetStore | undefined, now = Math.floor(Date.now() / 1000)) {
  if (!db) return;
  await db.prepare('INSERT INTO ai_usage (bucket, used, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET expires_at = excluded.expires_at').bind('provider-cooldown', now + 300).run();
}
