'use client';
import { SpecFlowState } from '@/types/specflow';
import { changeReceipt } from '@/lib/evidence';
import { AudioLines, ArrowRight } from 'lucide-react';
export default function ChangeReceipt({ before, after }: { before: SpecFlowState; after: SpecFlowState }) {
  const changes = changeReceipt(before, after);
  return <details className="change-receipt"><summary><AudioLines size={14}/><span>What changed in v{after.version}?</span><b>{changes.length} {changes.length === 1 ? 'change' : 'changes'}</b></summary><div className="change-receipt-body"><blockquote>{after.voicePromptUsed}</blockquote>{changes.length ? changes.map((change, i) => <div className="change-row" key={i}><span>{change.area}</span><ArrowRight size={12}/><p>{change.detail}</p></div>) : <p>No structural differences were detected. Review the refinement summary before accepting it.</p>}<small>Compared directly with v{before.version}. This receipt uses no AI calls.</small></div></details>;
}
