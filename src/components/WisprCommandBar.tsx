'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, Sparkles, X, CircleHelp } from 'lucide-react';
import { INVOICE_DEMO, REFUND_DEMO } from '@/types/specflow';
import { parseVoiceIntent } from '@/lib/workflow';
interface Props { active: boolean; busy: boolean; inline?: boolean; stage?: number; onRun: (prompt: string) => Promise<boolean>; onHelp?: () => void }
export default function WisprCommandBar({ active, busy, inline = false, stage = 0, onRun, onHelp }: Props) {
  const [text, setText] = useState(''), [count, setCount] = useState<number | null>(null);
  const input = useRef<HTMLTextAreaElement>(null), pasted = useRef(false), submitting = useRef(false);
  const submitRef = useRef<(value: string) => Promise<void>>(async () => {});
  useEffect(() => { input.current?.focus(); const timer = setInterval(() => { if (document.activeElement === document.body && !document.querySelector('[role="dialog"]')) input.current?.focus(); }, 750); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!busy && !document.querySelector('[role="dialog"]')) input.current?.focus(); }, [busy, stage]);
  useEffect(() => { const focus = (event: KeyboardEvent) => { if (event.altKey && event.key === '/') { event.preventDefault(); input.current?.focus(); } }; window.addEventListener('keydown', focus); return () => window.removeEventListener('keydown', focus); }, []);
  async function submit(value: string) {
    if (!value.trim() || busy || submitting.current) return;
    setCount(null); submitting.current = true;
    try { if (await onRun(value.trim())) setText(''); } finally { submitting.current = false; }
  }
  submitRef.current = submit;
  useEffect(() => {
    if (count === null || busy) return;
    const timer = setTimeout(() => { if (count <= .1) { setCount(null); void submitRef.current(text); } else setCount(Math.max(0, count - .1)); }, 100);
    return () => clearTimeout(timer);
  }, [count, text, busy]);
  function sample(value: string) { if (busy) return; setText(value); setCount(2); input.current?.focus(); }
  return <div className={inline ? 'capture-composer' : 'dock-wrap guided-dock'}>
    {!inline && <div className="voice-shortcuts"><span><AudioLines size={12}/> SAY A CHANGE OR A COMMAND</span><button disabled={busy} onClick={() => sample('Next step')}>“Next step”</button><button disabled={busy} onClick={() => sample('Add a Redis retry queue and make Ananya P0 with 8 points.')}>“Add Redis + Ananya → P0”</button><button onClick={onHelp} aria-label="Show voice commands"><CircleHelp size={14}/></button></div>}
    <div className={'voice-dock ' + (inline ? 'capture-dock' : '')}>
      <div className="dock-top"><span><i className={'dot ' + (active ? 'green' : 'purple')}/>{active ? 'WISPR FLOW · REFINE & NAVIGATE' : 'WISPR FLOW · SPEAK YOUR BRIEF'}</span><span className="dock-hint">Use your configured Flow shortcut</span></div>
      <div className="dock-input">{!inline && <div className="mic-icon"><AudioLines size={23}/></div>}<textarea ref={input} aria-label={active ? 'Voice command or plan refinement' : 'Project brief'} value={text} maxLength={6000} disabled={busy} placeholder={busy ? 'Your plan is being generated…' : active ? 'Say “next step”, or tell us what should change…' : '“Build a refund system using Stripe and Postgres. Refunds over ₹5,000 need approval. Assign the backend to Ananya…”'} onPaste={() => { pasted.current = true; }} onChange={e => {
        const value = e.target.value, delta = value.length - text.length;
        setText(value);
        const burst = pasted.current || delta >= 25;
        const enough = value.trim().split(/\s+/).length >= 6 || !!parseVoiceIntent(value);
        setCount(burst && enough ? 2 : null); pasted.current = false;
      }} onKeyDown={e => { if (e.key === 'Escape') { setCount(null); } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit(text); } }}/>{!inline && <button className="send" aria-label="Run voice command" disabled={busy || !text.trim()} onClick={() => void submit(text)}><ArrowUp size={20}/></button>}</div>
      <div className="composer-status" aria-live="polite">{count !== null ? <><span className="countdown-orbit" style={{ background: `conic-gradient(#bea9ff ${count / 2 * 360}deg, #383140 0)` }}><i/></span><span>Text burst detected · running in <b>{count.toFixed(1)}s</b></span><button onClick={() => setCount(null)}><X size={12}/> Cancel</button></> : <><span><i className="dot green"/>{active ? 'Draft changes auto-run. Sending requires approval.' : 'Dictation or pasted text starts a 2-second countdown.'}</span><span className="key">↵ to {active ? 'run' : 'build'}</span></>}</div>
      {inline && <div className="capture-actions"><span>Or type your brief. No microphone access required by SpecFlow.</span><button className="primary" disabled={busy || !text.trim()} onClick={() => void submit(text)}>Build my plan <ArrowUp size={16}/></button></div>}
    </div>
    {inline && <div className="capture-samples"><span>TRY A SAMPLE</span><button disabled={busy} onClick={() => sample(INVOICE_DEMO)}><Sparkles size={12}/> Invoice & GST triage</button><button disabled={busy} onClick={() => sample(REFUND_DEMO)}><Sparkles size={12}/> Customer refunds</button></div>}
  </div>;
}
