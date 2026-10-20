import { authenticatedUser, firestore } from '@/lib/firebase-admin';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const user = await authenticatedUser(request), { id } = await context.params;
    if (!/^[a-f0-9-]{36}$/.test(id)) return Response.json({ error: 'Project not found.' }, { status: 404, headers });
    const doc = await firestore()!.collection('specflow_users').doc(user.uid).collection('projects').doc(id).get();
    if (!doc.exists) return Response.json({ error: 'Project not found.' }, { status: 404, headers });
    return Response.json({ id: doc.id, ...doc.data() }, { headers });
  } catch { return Response.json({ error: 'Sign in to open this project.' }, { status: 401, headers }); }
}
