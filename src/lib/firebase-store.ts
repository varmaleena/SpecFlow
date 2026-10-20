import type { Firestore } from 'firebase-admin/firestore';

// Compatibility adapter for the finite storage operations used by the planner.
// Every mutation is a Firestore transaction. This is not a general SQL engine.
export class FirebaseStore {
  constructor(private db: Firestore) {}
  prepare(sql: string) {
    const db = this.db;
    let args: (string | number)[] = [];
    const execute = async () => {
      const empty = { row: null as Record<string, unknown> | null, meta: { changes: 0 } };
      const a = args;
      if (/^DELETE FROM (ai_usage|wispr_connections) WHERE expires_at < \?$/.test(sql)) {
        const table = sql.includes('ai_usage') ? 'ai_usage' : 'wispr_connections';
        const expired = await db.collection(`specflow_${table}`).where('expires_at', '<', a[0]).limit(50).get();
        if (expired.empty) return empty;
        const batch = db.batch(); expired.docs.forEach(d => batch.delete(d.ref)); await batch.commit();
        return { ...empty, meta: { changes: expired.size } };
      }
      const table = sql.includes('ai_usage') ? 'ai_usage' : sql.includes('wispr_connections') ? 'wispr_connections' : sql.includes('delivery_attempts') ? 'delivery_attempts' : null;
      if (!table) throw Error('Unsupported storage operation.');
      let id: string | number;
      if (sql.startsWith('INSERT') || sql.startsWith('SELECT') || sql.startsWith('DELETE')) id = a[0];
      else if (sql.startsWith('UPDATE wispr_connections SET tokens_sealed = ?, verifier_sealed = NULL')) id = a[3];
      else if (sql.startsWith('UPDATE wispr_connections SET tokens_sealed = ?')) id = a[2];
      else if (sql.startsWith('UPDATE wispr_connections SET state_hash = NULL')) id = a[0];
      else id = a[1];
      if (typeof id !== 'string' || !/^[A-Za-z0-9:_-]{1,150}$/.test(id)) throw Error('Invalid storage identity.');
      const ref = db.collection(`specflow_${table}`).doc(id);
      return db.runTransaction(async tx => {
        const snapshot = await tx.get(ref), row = snapshot.data();
        if (sql === 'SELECT expires_at FROM ai_usage WHERE bucket = ? AND expires_at > ?') return { ...empty, row: row && row.expires_at > a[1] ? row : null };
        if (sql === 'SELECT * FROM wispr_connections WHERE session_hash = ? AND expires_at > ?') return { ...empty, row: row && row.expires_at > a[1] ? row : null };
        if (sql === 'SELECT state FROM delivery_attempts WHERE id = ?') return { ...empty, row: row || null };
        if (sql === 'INSERT INTO ai_usage (bucket, used, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET used = used + 1 WHERE used < ? RETURNING used') {
          if (row && row.used >= Number(a[2])) return empty;
          const updated = { bucket: id, used: Number(row?.used || 0) + 1, expires_at: a[1] }; tx.set(ref, updated); return { row: updated, meta: { changes: 1 } };
        }
        if (sql === 'INSERT INTO ai_usage (bucket, used, expires_at) VALUES (?, 1, ?) ON CONFLICT(bucket) DO UPDATE SET expires_at = excluded.expires_at') { tx.set(ref, { bucket: id, used: 1, expires_at: a[1] }); }
        else if (sql === 'INSERT INTO delivery_attempts (id, state, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING') {
          if (snapshot.exists) return empty; tx.set(ref, { id, state: a[1], created_at: a[2] });
        } else if (sql === 'UPDATE delivery_attempts SET state = ? WHERE id = ? AND state = ?') {
          if (!row || row.state !== a[2]) return empty; tx.update(ref, { state: a[0] });
        } else if (sql === 'UPDATE delivery_attempts SET state = ? WHERE id = ?') {
          if (!row) return empty; tx.update(ref, { state: a[0] });
        } else if (sql === 'DELETE FROM wispr_connections WHERE session_hash = ?') { if (!row) return empty; tx.delete(ref); }
        else if (sql === 'INSERT INTO wispr_connections (session_hash, state_hash, verifier_sealed, token_expires, expires_at) VALUES (?, ?, ?, ?, ?)') { tx.create(ref, { session_hash: id, state_hash: a[1], verifier_sealed: a[2], token_expires: a[3], expires_at: a[4], tokens_sealed: null }); }
        else if (sql === 'UPDATE wispr_connections SET state_hash = NULL WHERE session_hash = ? AND state_hash = ?') {
          if (!row || row.state_hash !== a[1]) return empty; tx.update(ref, { state_hash: null });
        } else if (sql === 'UPDATE wispr_connections SET tokens_sealed = ?, token_expires = ? WHERE session_hash = ?') { if (!row) return empty; tx.update(ref, { tokens_sealed: a[0], token_expires: a[1] }); }
        else if (sql === 'UPDATE wispr_connections SET tokens_sealed = ?, verifier_sealed = NULL, token_expires = ?, expires_at = ? WHERE session_hash = ?') { if (!row) return empty; tx.update(ref, { tokens_sealed: a[0], verifier_sealed: null, token_expires: a[1], expires_at: a[2] }); }
        else throw Error('Unsupported storage operation.');
        return { ...empty, meta: { changes: 1 } };
      });
    };
    return { bind(...values: (string | number)[]) { args = values; return this; }, async first<T>() { return (await execute()).row as T | null; }, async run() { return execute(); } };
  }
}
