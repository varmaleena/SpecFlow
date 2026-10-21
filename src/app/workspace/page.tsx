'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowRight, ArrowLeft, Check, Settings as SettingsIcon, CircleHelp, GitBranch, FileText, ListTodo, Send, ShieldCheck, Sparkles, Download, Copy, X, Clock3, BookOpen, Columns3, MessageSquare, RotateCcw, ChevronRight, ExternalLink } from 'lucide-react';
import { SpecFlowState, SprintTicket } from '@/types/specflow';
import { localEngine } from '@/lib/localEngine';
import { validState, AiResult } from '@/lib/ai';
import { canDeliver, changedReviews, editTicket, editSpecification, parseVoiceIntent, STAGES } from '@/lib/workflow';
import { download, markdown, ticketCsv } from '@/lib/export';
import MermaidDiagram from '@/components/MermaidDiagram';
import WisprCommandBar from '@/components/WisprCommandBar';
import SettingsModal, { DEFAULT_SETTINGS, Settings } from '@/components/SettingsModal';
import KanbanModal from '@/components/KanbanModal';
import SprintBoardPanel from '@/components/SprintBoardPanel';
import PrdPanel from '@/components/PrdPanel';
import EngineStatus from '@/components/EngineStatus';
import VoiceGuide from '@/components/VoiceGuide';
import MeetingContext from '@/components/MeetingContext';
import TicketEditor from '@/components/TicketEditor';
import ChangeReceipt from '@/components/ChangeReceipt';
import SpecificationEditor from '@/components/SpecificationEditor';
import ProjectsModal from '@/components/ProjectsModal';
import SiteHeader from '@/components/SiteHeader';
import ConnectedDelivery, { DeliveryControls } from '@/components/ConnectedDelivery';

const FALLBACKS: Record<string, string> = {
  daily_limit: 'The shared AI daily limit has been reached. Your plan was generated locally without spending AI quota.',
  minute_limit: 'Shared AI is busy. Your plan was generated locally; AI can be tried again in a minute.',
  provider_quota: 'The provider reported a quota limit. Local planning stays available while AI pauses briefly.',
  budget_unavailable: 'AI usage controls are unavailable. Your plan was generated locally.',
  provider_unavailable: 'AI could not finish this request. Review the local requirements map and its unresolved questions.',
  edit_unapplied: 'This change needs the AI engine, which is unavailable. Your existing plan was kept; the requested change has not been applied.',
};
type Receipt = { version: number; at: string; id?: string };
export default function Home() {
  const [state, setState] = useState<SpecFlowState | null>(null), [history, setHistory] = useState<SpecFlowState[]>([]);
  const [stage, setStage] = useState(0), [furthest, setFurthest] = useState(0), [reviewed, setReviewed] = useState<number[]>([]), [approved, setApproved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false), [engine, setEngine] = useState('Smart Local NLP'), [toast, setToast] = useState('');
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS), [settingsOpen, setSettingsOpen] = useState(false), [guide, setGuide] = useState(false), [kanban, setKanban] = useState(false), [issues, setIssues] = useState(false), [editing, setEditing] = useState<SprintTicket | null>(null);
  const [specEditing, setSpecEditing] = useState(false), [projectsOpen, setProjectsOpen] = useState(false);
  const [notes, setNotes] = useState(''), [noteSource, setNoteSource] = useState(''), [slackDraft, setSlackDraft] = useState(''), [emailDraft, setEmailDraft] = useState(''), [deliveryTab, setDeliveryTab] = useState<'slack' | 'email'>('slack');
  const [pendingSend, setPendingSend] = useState<number | null>(null), [sending, setSending] = useState(false), [receipt, setReceipt] = useState<Receipt | null>(null), [buildStep, setBuildStep] = useState(0);
  const deliveryControls = useRef<DeliveryControls>(null);
  const running = useRef(false), sendLock = useRef(false), canvas = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const storedSettings = JSON.parse(localStorage.getItem('specflow-settings') || '{}') as Partial<Settings>;
      setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
      localStorage.setItem('specflow-settings', JSON.stringify({ ...storedSettings, apiKey: '', webhook: '' }));
      const saved = JSON.parse(localStorage.getItem('specflow-history') || '[]') as unknown;
      if (Array.isArray(saved)) { const versions = saved.filter(validState).slice(-20); if (versions.length) { const current = versions[versions.length - 1]; setHistory(versions); setState(current); setStage(1); setFurthest(1); setSlackDraft(current.comms.slackMessageMarkdown); setEmailDraft(current.comms.stakeholderEmailBody); } }
      const pending=sessionStorage.getItem('specflow-open-project');
      if(pending){sessionStorage.removeItem('specflow-open-project');const project=JSON.parse(pending);if(validState(project.state)){const opened={...project.state,voicePromptUsed:project.originalBrief||project.state.voicePromptUsed};setState(opened);setHistory([opened]);setStage(1);setFurthest(1);setSlackDraft(opened.comms.slackMessageMarkdown);setEmailDraft(opened.comms.stakeholderEmailBody);localStorage.setItem('specflow-history',JSON.stringify([opened]));}}
      const params = new URLSearchParams(window.location.search);
      if(params.has('new')){setState(null);setHistory([]);setStage(0);setFurthest(0);localStorage.removeItem('specflow-history');}
      if (params.has('wispr')) { setStage(0); setToast(params.get('wispr') === 'connected' ? 'Wispr account authorized. Find a meeting in Optional context to verify and import it.' : 'Wispr authorization did not complete. Reconnect or paste notes to continue.'); window.history.replaceState({}, '', window.location.pathname); }
    } catch { /* A corrupt device-local preference never blocks a new brief. */ }
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 7000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (!busy) { setBuildStep(0); return; } const timer = setInterval(() => setBuildStep(step => Math.min(3, step + 1)), 1100); return () => clearInterval(timer); }, [busy]);

  function goTo(next: number) { setStage(next); requestAnimationFrame(() => canvas.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
  function persist(next: SpecFlowState, reset = false) {
    const invalidated = changedReviews(reset ? null : state, next);
    setReviewed(old => reset ? [] : old.filter(step => !invalidated.includes(step)));
    setApproved(null); setPendingSend(null); setReceipt(null);
    setState(next); setSlackDraft(next.comms.slackMessageMarkdown); setEmailDraft(next.comms.stakeholderEmailBody);
    setHistory(old => { const versions = [...(reset ? [] : old.filter(v => v.version < next.version)), next].slice(-20); try { localStorage.setItem('specflow-history', JSON.stringify(versions)); } catch { setToast('Device storage is full. Export the plan to keep a copy.'); } return versions; });
  }
  const nextStage = () => {
    if (!state || stage === 0 || stage === 4) return;
    setReviewed(old => old.includes(stage) ? old : [...old, stage]);
    setFurthest(old => Math.max(old, stage + 1)); goTo(stage + 1);
  };
  function approvePlan() {
    const missing = [1, 2, 3].filter(step => !reviewed.includes(step));
    if (!state) return;
    if (missing.length) { setToast(`Review ${missing.map(step => STAGES[step].title.toLowerCase()).join(', ')} before approving this version.`); goTo(missing[0]); return; }
    setApproved(state.version); setToast(`Version ${state.version} approved. Choose a delivery action to prepare its preview.`);
  }
  async function runPrompt(prompt: string): Promise<boolean> {
    const intent = parseVoiceIntent(prompt);
    if (intent) {
      if (intent.type === 'help') setGuide(true);
      else if (intent.type === 'edit_spec') { if (state && furthest >= 2) setSpecEditing(true); else setToast('Review the architecture first to unlock specification editing.'); }
      else if (intent.type === 'edit_ticket') { const ticket = state?.sprint.tickets.find(t => t.id === intent.id); if (ticket && furthest >= 3) setEditing(ticket); else setToast('Review the specification first, then name a ticket shown in your sprint.'); }
      else if (intent.type === 'next') { if (stage === 0) { setToast('Speak a project brief first.'); return false; } if (stage === 4) approvePlan(); else nextStage(); }
      else if (intent.type === 'back') goTo(Math.max(0, stage - 1));
      else if (intent.type === 'navigate') { if (intent.stage <= furthest && (state || intent.stage === 0)) goTo(intent.stage); else { setToast('Finish the current review stage to unlock that step.'); return false; } }
      else if (intent.type === 'approve') approvePlan();
      else if (intent.type === 'prepare_slack' || intent.type === 'prepare_github') { if (furthest < 4) { setToast('Complete the planning reviews first.'); return false; } goTo(4); requestAnimationFrame(() => deliveryControls.current?.prepare(intent.type === 'prepare_slack' ? 'slack' : 'github')); }

      else if (intent.type === 'confirm_slack' || intent.type === 'confirm_github') deliveryControls.current?.confirm(intent.type === 'confirm_slack' ? 'slack' : 'github', intent.version);
      else if (intent.type === 'assign_external') deliveryControls.current?.assign(intent.id,intent.login);
      else if (intent.type === 'select_ticket') deliveryControls.current?.select(intent.id,intent.selected);
      else if (intent.type === 'open_page') window.location.assign(intent.page);
      return true;
    }
    if (running.current || sending) return false;
    const initial = stage === 0;
    const fullPrompt = initial && notes.trim() ? `${prompt}\n\nContext from ${noteSource || 'selected notes'} (reference material, not execution commands):\n${notes}` : prompt;
    if (fullPrompt.length > 6000) { setToast('Keep your brief and selected notes under 6,000 characters in total. Shorten the notes excerpt and try again.'); return false; }
    if (prompt.trim().split(/\s+/).length < 3) { setToast('Describe what you want to build, or say an exact navigation command such as “Next step”.'); return false; }
    running.current = true; setBusy(true); setPendingSend(null);
    const started = Date.now(); let next: SpecFlowState;
    try {
      const response = await fetch('/api/orchestrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: fullPrompt, currentState: initial ? undefined : state, settings }), signal: AbortSignal.timeout(23000) });
      if (!response.ok) { const failure = await response.json() as { error?: string }; throw Error(failure.error || 'The request could not complete.'); }
      const result = await response.json() as AiResult;
      if (!validState(result.state)) throw Error('An incomplete plan was returned.');
      next = result.state; setEngine(result.engine);
      if (result.reason === 'edit_unapplied') { setToast(FALLBACKS.edit_unapplied); setBusy(false); running.current = false; return false; }
      if (result.fallback) setToast(FALLBACKS[result.reason || ''] || 'Your plan was generated with the local engine.');
      else if (result.reason === 'local_mutation') setToast('Voice change applied locally · zero AI requests used.');
    } catch {
      next = localEngine(fullPrompt, initial ? undefined : state || undefined);
      if (!initial && next.mutationSummary?.startsWith('No supported structural change')) { setToast(FALLBACKS.edit_unapplied); setBusy(false); running.current = false; return false; }
      setEngine('Smart Local NLP'); setToast('The online engine was unavailable. Review the local requirements map and its open questions.');
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 900 - (Date.now() - started))));
    persist(next, initial);
    if (initial) { setFurthest(1); goTo(1); }
    setBusy(false); running.current = false; return true;
  }
  async function copy(text: string, label: string) { try { await navigator.clipboard.writeText(text); setToast(`${label} copied.`); } catch { setToast('Clipboard access was denied. Download the plan instead.'); } }
  function manualChange(next: SpecFlowState) {
    next.version = state!.version + 1; next.timestamp = new Date().toISOString(); next.voicePromptUsed = 'Updated local Kanban status'; next.mutationSummary = 'Sprint status updated in this browser. Review the sprint before delivering this version.';
    persist(next);
  }
  const allReviewed = [1, 2, 3].every(step => reviewed.includes(step));
  const deliveryReady = canDeliver(state, reviewed, approved);
  const previousVersion = state ? history.filter(v => v.version < state.version).at(-1) : null;
  const originalBrief = history.find(v => v.version === 1)?.voicePromptUsed || state?.voicePromptUsed || '';
  const icons = [AudioLines, GitBranch, FileText, ListTodo, Send];
  const step = STAGES[stage];
  return <div className="app-shell guided-app public-site workspace-shell">
    <SiteHeader actions={<div className="workspace-actions"><button onClick={() => setProjectsOpen(true)}><BookOpen size={15}/> Save project</button><button onClick={() => setGuide(true)}><CircleHelp size={15}/> Voice guide</button><button aria-label="AI settings" onClick={() => setSettingsOpen(true)}><SettingsIcon size={17}/></button></div>}/>
    <main className="guided-main">
      <nav className="journey-nav" aria-label="Planning workflow">{STAGES.map((item, index) => { const Icon = icons[index], done = index > 0 && reviewed.includes(index); return <button key={item.title} disabled={busy || sending || (index > furthest && index !== 0)} className={'journey-step ' + (stage === index ? 'current' : '') + (done ? ' reviewed' : '')} aria-current={stage === index ? 'step' : undefined} onClick={() => goTo(index)}><span className="journey-number">{done ? <Check size={14}/> : <Icon size={16}/>}</span><span><small>0{index + 1}</small><b>{item.title}</b></span>{index < 4 && <ChevronRight className="journey-chevron" size={14}/>}</button>; })}</nav>
      <div className="journey-toolbar"><div className="journey-breadcrumb"><span>Workspace</span><ChevronRight size={12}/><b>{step.label}</b></div>{state && <div className="journey-project-actions"><span className="project-indicator"><i className="dot green"/>Saved in this browser</span><select aria-label="Version history" value={state.version} disabled={busy || sending} onChange={e => { const previous = history.find(v => v.version === Number(e.target.value)); if (previous) { setState(previous); setReviewed([]); setApproved(null); setPendingSend(null); setReceipt(null); setSlackDraft(previous.comms.slackMessageMarkdown); setEmailDraft(previous.comms.stakeholderEmailBody); setFurthest(1); goTo(1); } }}>{history.map(item => <option key={item.version} value={item.version}>v{item.version} · {item.version === 1 ? 'Initial brief' : 'Refinement'}</option>)}</select><button disabled={busy || sending} onClick={() => { setApproved(null); setPendingSend(null); goTo(0); }}><AudioLines size={12}/> New brief</button></div>}</div>
      <div ref={canvas} className="journey-canvas">
        <section className="stage-heading"><div><span className="eyebrow"><span className="mini-line"/> STEP 0{stage + 1} OF 05 · {stage === 0 ? 'CAPTURE' : state?.projectTitle.toUpperCase()}</span><h1>{stage === 0 ? <>A clear plan starts<br/>with <span>your voice.</span></> : ['','See how it fits together.','Make the requirements clear.','Give every task a next step.','One reviewed plan. Ready to share.'][stage]}</h1><p>{stage === 0 ? 'Speak the goal, constraints, and who’s involved. Then review one part of the plan at a time.' : step.description}</p></div>{stage === 0 ? <div className="wispr-first-badge"><AudioLines size={22}/><span>Speak naturally.<b>Wispr Flow does the typing.</b></span></div> : state && <div className="stage-meta"><span className="engine-pill"><Sparkles size={12}/>{engine}</span><small>{state.metrics.voiceWordCount} brief words → {state.metrics.generatedArtifactWords} artifact words</small></div>}</section>
        {state?.mutationSummary && stage > 0 && <div className="diff-banner"><Sparkles size={16}/><div><b>Plan updated · v{state.version}</b><span>{state.mutationSummary}</span></div><button onClick={() => goTo(1)}>Review from architecture <ArrowRight size={12}/></button></div>}
        {state && previousVersion && stage > 0 && <ChangeReceipt before={previousVersion} after={state}/>} {busy ? <section className="generation-scene" aria-live="polite"><div className="generation-orb"><AudioLines size={36}/></div><span className="eyebrow">YOUR BRIEF IS BECOMING A PLAN</span><h2>{['Understanding your brief…','Connecting the architecture…','Scoping the work…','Preparing your review…'][buildStep]}</h2><p>One compact generation creates the connected drafts. You’ll review them in order.</p><div className="generation-track">{['Brief','Architecture','Spec & tickets','Review'].map((label, i) => <div className={buildStep >= i ? 'active' : ''} key={label}><span>{buildStep > i ? <Check size={13}/> : i + 1}</span><small>{label}</small></div>)}</div><div className="progress-track"><i/></div><small>Local fallback stays available if AI is unavailable or quota is reached.</small></section> : stage === 0 ? <div className="capture-layout"><section className="capture-card"><header><span className="capture-label"><AudioLines size={17}/> YOUR PROJECT BRIEF</span><button onClick={() => setGuide(true)}><CircleHelp size={13}/> How to speak it</button></header><div className="brief-prompts"><span>What are we building?</span><span>Who owns it?</span><span>What should we guard against?</span></div><WisprCommandBar inline active={false} busy={busy} onRun={runPrompt} onHelp={() => setGuide(true)}/><div className="capture-output-path"><span>YOUR VOICE</span><ArrowRight size={12}/><b>Architecture</b><ArrowRight size={12}/><b>Spec</b><ArrowRight size={12}/><b>Sprint</b><ArrowRight size={12}/><b>Delivery</b></div>{state && <button className="return-plan" onClick={() => goTo(1)}>Return to the current plan <ArrowRight size={13}/></button>}</section><MeetingContext text={notes} source={noteSource} onChange={(value, source) => { setNotes(value); setNoteSource(source); }} disabled={busy}/></div> : state ? <>
          {stage === 1 && <div className="stage-layout architecture-stage"><section className="panel stage-panel"><header className="panel-header"><span className="panel-number violet"><GitBranch size={16}/></span><div><h2>{state.projectTitle}</h2><span>{state.executiveSummary.startsWith('Local requirements map') ? 'REQUIREMENTS MAP · LOCAL DRAFT' : 'SYSTEM ARCHITECTURE · DRAFT'}</span></div><span className="count-badge">{state.architecture.nodes.length} nodes</span></header><MermaidDiagram code={state.architecture.mermaidCode}/><footer className="guardrails"><span className="eyebrow"><ShieldCheck size={12}/> PROPOSED SECURITY & COMPLIANCE</span><div>{state.architecture.securityGuardrails.map(item => <span key={item}><ShieldCheck size={11}/>{item}</span>)}</div></footer></section><aside className="stage-insight"><span className="section-kicker">CHECK THE BIG PICTURE</span><h3>Does this follow your idea?</h3><p>{state.executiveSummary.split('Source brief:')[0]}</p><ul><li>Every stated rule is represented or listed for review.</li><li>Conditions preserve the exact thresholds and units.</li><li>Connections are proposed dependencies; check exact conditions in the specification.</li></ul><div className="say-card"><AudioLines size={17}/><span>TRY SAYING</span><p>“Add a Redis retry queue before the payment service.”</p><small>New nodes glow green. Your linked drafts update.</small></div><details className="source-brief"><summary>Review open questions and assumptions</summary><ul>{state.prd.edgeCases.map((item, i) => <li key={i}>{item}</li>)}</ul></details><details className="source-brief"><summary><BookOpen size={13}/> View the source brief</summary><pre>{state.voicePromptUsed}</pre></details></aside></div>}
          {stage === 2 && <div className="stage-layout"><section className="panel stage-panel"><header className="panel-header"><span className="panel-number amber"><FileText size={16}/></span><div><h2>Engineering specification</h2><span>REQUIREMENTS · EDGE CASES · API CONTRACTS</span></div><button onClick={() => void copy(markdown(state), 'Specification')}><Copy size={13}/> Copy</button><button onClick={() => download('PRD.md', markdown(state))}><Download size={13}/></button></header><div style={{padding:16}}><button className="primary" onClick={() => setSpecEditing(true)}><AudioLines size={14}/> Edit specification with Flow</button><small style={{display:"block",marginTop:8}}>Or say “Edit specification” in the voice dock.</small></div><PrdPanel state={state}/></section><aside className="stage-insight"><span className="section-kicker">TURN INTENT INTO AGREEMENT</span><h3>Could someone build from this?</h3><p>Read the problem and requirements first. Then check failure cases and the proposed API contracts.</p><ul><li>Requirements describe observable behavior.</li><li>Missing data and downstream failures are covered.</li><li>Approval and access rules are explicit.</li></ul><div className="say-card"><AudioLines size={17}/><span>TRY SAYING</span><p>“Add a requirement that duplicate requests never create duplicate payouts.”</p><small>Unfamiliar changes use the AI engine when available.</small></div></aside></div>}
          {stage === 3 && <><div className="sprint-summary"><div><b>{state.sprint.tickets.length}</b><span>scoped tickets</span></div><div><b>{state.sprint.totalStoryPoints}</b><span>story points</span></div><div><b>{state.sprint.tickets.filter(t => t.priority === 'P0 - Critical').length}</b><span>critical tasks</span></div><button onClick={() => download('tickets.json', JSON.stringify(state.sprint.tickets, null, 2), 'application/json')}>Ticket JSON</button><button onClick={() => download('tickets.csv', ticketCsv(state), 'text/csv')}>Ticket CSV</button><button onClick={() => setKanban(true)}><Columns3 size={16}/> Open local Kanban <ArrowRight size={13}/></button></div><section className="panel stage-panel sprint-stage"><header className="panel-header"><span className="panel-number blue"><ListTodo size={17}/></span><div><h2>{state.sprint.sprintName}</h2><span>DRAFT OWNERS · PRIORITIES · ACCEPTANCE CRITERIA</span></div><span className="say-inline"><AudioLines size={13}/> “Make Ananya P0 with eight points.”</span></header><SprintBoardPanel key={state.version} tickets={state.sprint.tickets} onEdit={setEditing} source={originalBrief}/></section><div className="honest-note"><ShieldCheck size={14}/><span>Owners and status are draft planning fields. This board is local to your browser; Jira and company directories are not connected.</span></div></>}
          {stage === 4 && <ConnectedDelivery ref={deliveryControls} state={state} approved={deliveryReady} reviewed={reviewed} onApprove={approvePlan} onReview={goTo} onBusy={setSending}/> }
          <footer className="stage-navigation"><button className="stage-back" disabled={sending} onClick={() => goTo(Math.max(0, stage - 1))}><ArrowLeft size={14}/>{stage === 1 ? 'Back to brief' : `Back to ${STAGES[stage - 1].title.toLowerCase()}`}</button><div><span><AudioLines size={13}/> You can say “Next step”.</span>{stage < 4 ? <button className="primary" onClick={nextStage}>Looks good · {STAGES[stage + 1].title.toLowerCase()}<ArrowRight size={15}/></button> : <button onClick={() => download('SpecFlow-plan.json', JSON.stringify(state, null, 2), 'application/json')}><Download size={14}/> Export JSON</button>}</div></footer>
          <p className="journey-estimate"><AudioLines size={12}/> Speak, review, then confirm. <span>Use your Wispr desktop usage card for challenge evidence.</span></p>
        </> : null}
      </div>
    </main>
    {stage > 0 && <WisprCommandBar active busy={busy || sending} stage={stage} onRun={runPrompt} onHelp={() => setGuide(true)}/>}
    {settingsOpen && <SettingsModal value={settings} onClose={() => setSettingsOpen(false)} onSave={value => { setSettings(value); localStorage.setItem('specflow-settings', JSON.stringify({ ...value, apiKey: '', webhook: '' })); setPendingSend(null); setToast('Preferences saved. Personal keys and webhooks remain in this session only.'); }}/>}
    {guide && <VoiceGuide onClose={() => setGuide(false)}/>}
    {projectsOpen && <ProjectsModal state={state} originalBrief={originalBrief} onClose={() => setProjectsOpen(false)} onLoad={(saved, source) => { persist({ ...saved, voicePromptUsed: source }, true); setFurthest(1); goTo(1); setToast("Saved project opened. Review this version before delivery."); }}/>}
    {specEditing && state && <SpecificationEditor prd={state.prd} onClose={() => setSpecEditing(false)} onSave={prd => { try { persist(editSpecification(state, prd)); setSpecEditing(false); setToast("Specification saved. Review architecture, specification and tickets for this version."); } catch (e) { setToast(e instanceof Error ? e.message : "Could not save specification."); } }}/>}
    {editing && state && <TicketEditor ticket={editing} onClose={() => setEditing(null)} onSave={ticket => { try { persist(editTicket(state, ticket)); setEditing(null); setToast(`${ticket.id} updated. The delivery announcement was refreshed.`); } catch (e) { setToast(e instanceof Error ? e.message : 'Could not save ticket.'); } }}/>}
    {kanban && state && <KanbanModal state={state} onChange={manualChange} onClose={() => setKanban(false)}/>}

    {toast && <div className="toast" role="status"><span className="toast-icon"><Sparkles size={17}/></span><div><b>SpecFlow</b><p>{toast}</p></div><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15}/></button></div>}
  </div>;
}
