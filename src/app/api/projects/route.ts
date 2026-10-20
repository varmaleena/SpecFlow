import { authenticatedUser, firestore } from '@/lib/firebase-admin';
import { validState } from '@/lib/ai';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  try {
    const user = await authenticatedUser(request), db = firestore()!;
    const docs = await db.collection('specflow_users').doc(user.uid).collection('projects').orderBy('updatedAt', 'desc').limit(20).get();
    return Response.json({ projects: docs.docs.map(doc => ({ id: doc.id, title: doc.data().state.projectTitle, updatedAt: doc.data().updatedAt, revision: doc.data().revision })) }, { headers });
  } catch { return Response.json({ error: 'Sign in with a configured Firebase account to access saved projects.' }, { status: 401, headers }); }
}
export async function POST(request: Request) {
  try {
    const user = await authenticatedUser(request), db = firestore()!;
    const raw = await request.text(); if (new TextEncoder().encode(raw).length > 250000) return Response.json({ error: 'This project is too large to save. Export it instead.' }, { status: 413, headers });
    const body = JSON.parse(raw);
    if (!validState(body.state) || typeof body.originalBrief !== 'string' || body.originalBrief.length > 6000 || (body.id && !/^[a-f0-9-]{36}$/.test(body.id))) return Response.json({ error: 'Provide a valid project.' }, { status: 400, headers });
    const id = body.id || crypto.randomUUID(), ref = db.collection('specflow_users').doc(user.uid).collection('projects').doc(id);
    const result = await db.runTransaction(async tx => {
      const old = await tx.get(ref);
      if (body.id && (!old.exists || old.data()?.revision !== body.revision)) return null;
      const revision = Number(old.data()?.revision || 0) + 1, updatedAt = new Date().toISOString();
      tx.set(ref, { state: body.state, originalBrief: body.originalBrief, revision, updatedAt });
      return { id, revision, updatedAt };
    });
    return result ? Response.json(result, { headers }) : Response.json({ error: 'This project changed elsewhere. Reopen the saved project before updating it, or save a new copy.' }, { status: 409, headers });
  } catch { return Response.json({ error: 'The project could not be saved. Check sign-in and Firebase server configuration.' }, { status: 401, headers }); }
}
