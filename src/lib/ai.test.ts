import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { orchestrate, parseOrchestrationRequest } from './ai';
import { reserveBudget, markCooldown, BudgetStore } from './quota';
import { localEngine } from './localEngine';

test('supported voice patches bypass Gemini and budget reservations', async () => {
  let calls = 0;
  const result = await orchestrate({ prompt: 'Add Redis and make Ananya P0.', currentState: localEngine('Build an invoice pipeline.'), geminiKey: 'test-only', reserveBudget: async () => { calls++; return { allowed: true }; }, fetcher: async () => { calls++; throw Error('Unexpected call'); } });
  assert.equal(calls, 0);
  assert.equal(result.aiRequests, 0);
  assert.equal(result.state.version, 2);
});

test('unsupported edits never create a fake successful version when AI is unavailable', async () => {
 const state=localEngine('Build a library portal. Check membership before issuing books.');
 for(const settings of [{provider:'local'},{provider:'gemini'}]){
  const result=await orchestrate({prompt:'Change membership checking to a monthly subscription policy.',currentState:state,settings});
  assert.equal(result.reason,'edit_unapplied');assert.equal(result.state.version,state.version);assert.deepEqual(result.state,state);
 }
});
test('voice queue edits preserve existing AI-generated branches and node IDs', async () => {
  const state = localEngine('Build a refund workflow using Stripe.');
  state.architecture.mermaidCode = 'graph TD\nINPUT["Request"]\nREVIEW["Review"]\nOUTPUT["Stripe"]\nDENIED["Declined"]\nINPUT --> REVIEW\nREVIEW -->|Approved| OUTPUT\nREVIEW -->|Rejected| DENIED';
  state.architecture.nodes = [{id:'INPUT',label:'Request',type:'ingest',tech:'API'},{id:'REVIEW',label:'Review',type:'human',tech:'Workflow'},{id:'OUTPUT',label:'Stripe',type:'external',tech:'Stripe'},{id:'DENIED',label:'Declined',type:'service',tech:'Workflow'}];
  const result = await orchestrate({ prompt: 'Add a Redis retry queue before Stripe.', currentState: state });
  assert.match(result.state.architecture.mermaidCode, /REVIEW -->\|Approved\| REDIS --> OUTPUT/);
  assert.match(result.state.architecture.mermaidCode, /REVIEW -->\|Rejected\| DENIED/);
});
test('a denied shared budget prevents every provider request', async () => {
  let called = false;
  const result = await orchestrate({ prompt: 'Build a clinic scheduler.', geminiKey: 'test-only', reserveBudget: async () => ({ allowed: false, reason: 'daily_limit', remaining: 0 }), fetcher: async () => { called = true; throw Error(); } });
  assert.equal(called, false);
  assert.equal(result.reason, 'daily_limit');
  assert.equal(result.engine, 'Smart Local NLP');
});
test('provider 429 triggers cooldown without retries or model escalation', async () => {
  let calls = 0, cooldowns = 0;
  const result = await orchestrate({ prompt: 'Build a clinic scheduler.', geminiKey: 'test-only', reserveBudget: async () => ({ allowed: true }), markQuotaExhausted: async () => { cooldowns++; }, fetcher: async () => { calls++; return new Response('{}', { status: 429 }); } });
  assert.equal(calls, 1);
  assert.equal(cooldowns, 1);
  assert.equal(result.reason, 'provider_quota');
});
test('malformed AI output falls back and valid output preserves canonical metadata', async () => {
  const options = { prompt: 'Build a clinic scheduler.', geminiKey: 'test-only' };
  const invalid = await orchestrate({ ...options, fetcher: async () => Response.json({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) });
  assert.equal(invalid.engine, 'Smart Local NLP');
  const data = { ...localEngine(options.prompt), version: 999 };
  const valid = await orchestrate({ ...options, fetcher: async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }] }) });
  assert.equal(valid.engine, 'Gemini 3.1 Flash-Lite');
  assert.equal(valid.state.version, 1);
  assert.equal(valid.state.sprint.totalStoryPoints, valid.state.sprint.tickets.reduce((sum, t) => sum + t.storyPoints, 0));
});
test('invalid saved state and oversized input are rejected before orchestration', () => {
  assert.throws(() => parseOrchestrationRequest(JSON.stringify({ prompt: 'A valid prompt', currentState: {} })));
  assert.throws(() => parseOrchestrationRequest(JSON.stringify({ prompt: 'a'.repeat(6001) })));
});
test('SQLite-backed budgets survive instances, throttle minutes, reset days and honor cooldown', async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE ai_usage (bucket TEXT PRIMARY KEY, used INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
  const db: BudgetStore = { prepare(sql) { let args: (string | number)[] = []; const statement = { bind(...values: (string | number)[]) { args = values; return statement; }, async first<T>() { return (sqlite.prepare(sql).get(...args) || null) as T | null; }, async run() { return sqlite.prepare(sql).run(...args); } }; return statement; } };
  const start = 86400 * 10;
  for (let i = 0; i < 3; i++) assert.equal((await reserveBudget(db, start)).allowed, true);
  assert.equal((await reserveBudget(db, start)).reason, 'minute_limit');
  // Throttled attempts must not consume the daily allowance.
  assert.equal((sqlite.prepare('SELECT used FROM ai_usage WHERE bucket = ?').get('day:10') as { used: number }).used, 3);
  for (let i = 3; i < 30; i++) assert.equal((await reserveBudget(db, start + i * 60)).allowed, true);
  assert.equal((await reserveBudget(db, start + 1900)).reason, 'daily_limit');
  assert.equal((await reserveBudget(db, start + 86400)).allowed, true);
  await markCooldown(db, start + 86400);
  assert.equal((await reserveBudget(db, start + 86410)).reason, 'provider_quota');
  assert.equal((await reserveBudget(db, start + 86800)).allowed, true);
  assert.equal((await reserveBudget(undefined)).allowed, false);
  sqlite.close();
});
