import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Firestore } from 'firebase-admin/firestore';
import { FirebaseStore } from './firebase-store';
import { reserveBudget, markCooldown } from './quota';
import { deliverWebhook } from './delivery';

// Deterministic adapter test double. Live Firestore transactions still require
// a configured project/emulator and are a separate deployment verification.
function store() {
  const rows = new Map<string, Record<string, unknown>>();
  const ref = (key: string) => ({ key });
  const snapshot = (r: { key: string }) => ({ exists: rows.has(r.key), data: () => rows.get(r.key) });
  const db = {
    collection(name: string) { return {
      doc(id: string) { return ref(`${name}/${id}`); },
      where(field: string, _operator: string, before: number) { return { limit(count: number) { return { async get() { const docs = [...rows].filter(([key, value]) => key.startsWith(`${name}/`) && Number(value[field]) < before).slice(0, count).map(([key]) => ({ ref: ref(key) })); return { docs, empty: docs.length === 0, size: docs.length }; } }; } }; },
    }; },
    batch() { const pending: string[] = []; return { delete(r: { key: string }) { pending.push(r.key); }, async commit() { pending.forEach(key => rows.delete(key)); } }; },
    async runTransaction<T>(action: (tx: unknown) => Promise<T>) { return action({ get: async (r: { key: string }) => snapshot(r), set: (r: { key: string }, data: Record<string, unknown>) => rows.set(r.key, data), update: (r: { key: string }, data: Record<string, unknown>) => rows.set(r.key, { ...rows.get(r.key), ...data }), create: (r: { key: string }, data: Record<string, unknown>) => { if (rows.has(r.key)) throw Error('exists'); rows.set(r.key, data); }, delete: (r: { key: string }) => rows.delete(r.key) }); },
  };
  return new FirebaseStore(db as unknown as Firestore);
}
test('Firebase adapter preserves minute/day limits and cooldown bindings', async () => {
 const db=store(),now=86400*100+10;
 for(let i=0;i<3;i++)assert.equal((await reserveBudget(db,now)).allowed,true);
 assert.equal((await reserveBudget(db,now)).reason,'minute_limit');
 assert.equal((await reserveBudget(db,now+60)).allowed,true);
 await markCooldown(db,now+61);assert.equal((await reserveBudget(db,now+62)).reason,'provider_quota');assert.equal((await reserveBudget(db,now+362)).allowed,true);
});
test('Firebase adapter consumes OAuth state once and stores encrypted payloads by session',async()=>{
 const db=store(),id='session_hash';
 await db.prepare('INSERT INTO wispr_connections (session_hash, state_hash, verifier_sealed, token_expires, expires_at) VALUES (?, ?, ?, ?, ?)').bind(id,'state_hash','sealed-verifier',100,1000).run();
 const sql='UPDATE wispr_connections SET state_hash = NULL WHERE session_hash = ? AND state_hash = ?';
 assert.equal((await db.prepare(sql).bind(id,'state_hash').run()).meta.changes,1);assert.equal((await db.prepare(sql).bind(id,'state_hash').run()).meta.changes,0);
 await db.prepare('UPDATE wispr_connections SET tokens_sealed = ?, verifier_sealed = NULL, token_expires = ?, expires_at = ? WHERE session_hash = ?').bind('sealed-tokens',500,1000,id).run();
 const row=await db.prepare('SELECT * FROM wispr_connections WHERE session_hash = ? AND expires_at > ?').bind(id,10).first<{tokens_sealed:string;verifier_sealed:null}>();assert.equal(row?.tokens_sealed,'sealed-tokens');assert.equal(row?.verifier_sealed,null);
 await assert.rejects(db.prepare('SELECT secret FROM arbitrary_table').bind('x').first());
});
test('Firebase delivery receipts prevent a second webhook request',async()=>{
 const db=store();let calls=0;const input={url:'https://hooks.slack.com/services/test/test/test',text:'Adapter test only',version:1};
 const fetcher=async()=>{calls++;return new Response('ok');};
 assert.equal((await deliverWebhook(input,db,fetcher)).status,200);assert.equal((await deliverWebhook(input,db,fetcher)).body.duplicate,true);assert.equal(calls,1);
});
