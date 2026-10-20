'use client';
import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { SpecFlowState } from '@/types/specflow';
export default function SpecificationEditor({ prd, onSave, onClose }: { prd: SpecFlowState['prd']; onSave: (prd: SpecFlowState['prd']) => void; onClose: () => void }) {
  const [problem, setProblem] = useState(prd.problemStatement), [requirements, setRequirements] = useState(prd.functionalRequirements.join('\n')), [exceptions, setExceptions] = useState(prd.edgeCases.join('\n'));
  const lines = (text: string) => text.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 30);
  return <div className="overlay" onClick={onClose}><section className="modal settings ticket-editor" role="dialog" aria-modal="true" aria-label="Edit specification" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <header><div><span className="eyebrow">WISPR FLOW · SPECIFICATION REVIEW</span><h2>Refine the spec with your voice.</h2></div><button aria-label="Close specification editor" onClick={onClose}><X size={19}/></button></header>
    <p>Click a field and use your Flow shortcut to dictate. For eligible Command Mode, select a passage and ask Flow to make it clearer or more testable. Add line breaks between requirements.</p>
    <label>Problem statement<textarea autoFocus value={problem} maxLength={6000} onChange={e => setProblem(e.target.value)}/></label>
    <label>Functional requirements · one per line<textarea value={requirements} maxLength={10000} onChange={e => setRequirements(e.target.value)}/></label>
    <label>Exceptions and open questions · one per line<textarea value={exceptions} maxLength={8000} onChange={e => setExceptions(e.target.value)}/></label>
    <p>Saving creates a new version. Review the related architecture and tickets for consistency before approving it.</p>
    <button className="primary" disabled={!problem.trim() || !requirements.trim()} onClick={() => onSave({ ...prd, problemStatement: problem.trim(), functionalRequirements: lines(requirements), edgeCases: lines(exceptions) })}><Check size={15}/> Save specification & review changes</button>
  </section></div>;
}
