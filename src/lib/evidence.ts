import { splitIntoSentences } from './brief-text';
import { SpecFlowState, SprintTicket } from '@/types/specflow';
const ignored = new Set(['the','and','for','with','from','into','that','this','using','build','create','implement','service','system','workflow','request','requests','should','must','user','users','have','will','then','your','their']);
function terms(text: string) { return new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(word => !ignored.has(word))); }
export function ticketEvidence(ticket: SprintTicket, source: string): string | null {
  const keywords = terms(ticket.title);
  const sentences = splitIntoSentences(source, true);
  let best = '', score = 0;
  for (const sentence of sentences) { const words = terms(sentence); const matched = [...keywords].filter(word => words.has(word)).length; if (matched > score) { best = sentence; score = matched; } }
  return score >= 2 ? best : null;
}
export function changeReceipt(before: SpecFlowState, after: SpecFlowState) {
  const changes: { area: string; detail: string }[] = [];
  for (const node of after.architecture.nodes) if (!before.architecture.nodes.some(n => n.id === node.id)) changes.push({ area: 'Architecture', detail: `Added ${node.label}` });
  for (const node of before.architecture.nodes) if (!after.architecture.nodes.some(n => n.id === node.id)) changes.push({ area: 'Architecture', detail: `Removed ${node.label}` });
  for (const guardrail of after.architecture.securityGuardrails) if (!before.architecture.securityGuardrails.includes(guardrail)) changes.push({ area: 'Guardrail', detail: guardrail });
  for (const ticket of after.sprint.tickets) {
    const old = before.sprint.tickets.find(t => t.id === ticket.id);
    if (!old) { changes.push({ area: 'Sprint', detail: `Added ${ticket.id}: ${ticket.title}` }); continue; }
    if (old.priority !== ticket.priority) changes.push({ area: ticket.id, detail: `${old.priority} → ${ticket.priority}` });
    if (old.storyPoints !== ticket.storyPoints) changes.push({ area: ticket.id, detail: `${old.storyPoints} → ${ticket.storyPoints} story points` });
    if (old.assignee !== ticket.assignee) changes.push({ area: ticket.id, detail: `${old.assignee} → ${ticket.assignee}` });
    if (old.title !== ticket.title) changes.push({ area: ticket.id, detail: `Title updated to “${ticket.title}”` });
    if (old.status !== ticket.status) changes.push({ area: ticket.id, detail: `${old.status.replace('_',' ')} → ${ticket.status.replace('_',' ')}` });
  }
  if (JSON.stringify(before.prd) !== JSON.stringify(after.prd)) changes.push({ area: 'Specification', detail: 'Requirements, edge cases or API contracts changed. Review the spec stage.' });
  return changes;
}
