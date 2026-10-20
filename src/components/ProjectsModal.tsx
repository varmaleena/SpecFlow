'use client';
import { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { firebaseAuth, firebaseConfigured } from '@/lib/firebase-client';
import { SpecFlowState } from '@/types/specflow';
import { validState } from '@/lib/ai';
type Project = { id: string; title: string; updatedAt: string; revision: number };
export default function ProjectsModal({ state, originalBrief, onLoad, onClose }: { state: SpecFlowState | null; originalBrief: string; onLoad: (state: SpecFlowState, originalBrief: string) => void; onClose: () => void }) {
  const [user, setUser] = useState<User | null>(null), [projects, setProjects] = useState<Project[]>([]), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (!firebaseConfigured) return; return onAuthStateChanged(firebaseAuth(), value => { setUser(value); setProjects([]); }); }, []);
  async function request(path: string, method = 'GET', body?: unknown) {
    if (!user) throw Error('Sign in to access saved projects.');
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json(); if (!response.ok) throw Error(data.error || 'The request could not complete.'); return data;
  }
  async function task(action: () => Promise<void>) { setBusy(true); setMessage(''); try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message : 'The request failed.'); } finally { setBusy(false); } }
  async function refresh() { setProjects((await request('/api/projects')).projects); }
  useEffect(() => { if (user) void task(refresh); }, [user?.uid]); // Each account lists only its own server-authorized records.
  return <div className="overlay" onClick={onClose}><section className="modal settings" role="dialog" aria-modal="true" aria-label="My projects" onClick={e => e.stopPropagation()}><header><div><span className="eyebrow">YOUR ACCOUNT · SAVED PLANS</span><h2>My projects</h2></div><button aria-label="Close projects" onClick={onClose}>×</button></header>
    <p>Guests can try the app. Sign in to save a project and reopen it on another device. Review approvals are reset when opening a saved plan.</p>
    {!firebaseConfigured ? <p role="status">Account saving is not configured on this deployment yet. Your browser workspace remains available.</p> : !user ? <button className="primary" disabled={busy} onClick={() => void task(async () => { await signInWithPopup(firebaseAuth(), new GoogleAuthProvider()); })}>Continue with Google</button> : <>
      <p>Signed in as {user.email || user.displayName || 'your account'}</p><button disabled={busy} onClick={() => void task(async () => { await signOut(firebaseAuth()); setMessage('Signed out. Browser-local drafts remain on this device.'); })}>Sign out</button>
      <button className="primary" disabled={busy || !state} onClick={() => void task(async () => { await request('/api/projects', 'POST', { state, originalBrief }); await refresh(); setMessage('A new project copy was saved to your account.'); })}>Save current plan as a new project</button>
      {projects.map(project => <div className="issue-link" key={project.id}><button disabled={busy} onClick={() => void task(async () => { const data = await request(`/api/projects/${project.id}`); if (!validState(data.state)) throw Error('The saved plan is incomplete.'); onLoad(data.state, data.originalBrief); onClose(); })}>Open {project.title}</button><small>{new Date(project.updatedAt).toLocaleString()}</small><button disabled={busy || !state} onClick={() => void task(async () => { await request('/api/projects', 'POST', { id: project.id, revision: project.revision, state, originalBrief }); await refresh(); setMessage('Saved project updated.'); })}>Replace with current plan</button></div>)}
      {!projects.length && <p>No saved projects yet.</p>}
    </>}{message && <p role="status">{message}</p>}
  </section></div>;
}
