import { SpecFlowState, SprintTicket } from '@/types/specflow';
export const STAGES = [
  { title: 'Brief', label: 'Speak the idea', description: 'Capture the goal, constraints and owners.' },
  { title: 'Architecture', label: 'See the system', description: 'Review the flow and guardrails.' },
  { title: 'Specification', label: 'Make it clear', description: 'Check requirements and API contracts.' },
  { title: 'Sprint', label: 'Plan the work', description: 'Refine ownership, priority and scope.' },
  { title: 'Deliver', label: 'Review & share', description: 'Approve this version and choose a destination.' },
] as const;
export type VoiceIntent = { type: 'navigate'; stage: number } | { type: 'next' | 'back' | 'approve' | 'prepare_github' | 'prepare_slack' | 'help' | 'edit_spec' } | { type: 'edit_ticket'; id: string } | { type: 'confirm_slack' | 'confirm_github'; version: number } | {type:'open_page';page:'/connections'|'/projects'} | {type:'assign_external';id:string;login:string} | {type:'select_ticket';id:string;selected:boolean};
const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
export function parseVoiceIntent(text: string): VoiceIntent | null {
  const p = text.toLowerCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim().replace(/^please /, '');
  if (['next', 'next step', 'continue', 'approve and continue', 'approve this step and continue'].includes(p)) return { type: 'next' };
  if (['go back', 'previous step', 'back'].includes(p)) return { type: 'back' };
  if (['approve plan', 'approve this plan', 'approve this version'].includes(p)) return { type: 'approve' };
  if (['prepare github drafts', 'prepare github issues'].includes(p)) return { type: 'prepare_github' };
  if (['prepare slack update', 'send slack update', 'prepare slack announcement'].includes(p)) return { type: 'prepare_slack' };
  if (['show voice guide', 'show voice commands', 'help with voice'].includes(p)) return { type: 'help' };
  if (['open connections','show connections','connect my tools'].includes(p)) return {type:'open_page',page:'/connections'};
  if (['open my projects','show my projects'].includes(p)) return {type:'open_page',page:'/projects'};
  if (['edit specification', 'edit the specification', 'edit spec', 'edit requirements'].includes(p)) return { type: 'edit_spec' };
  const ticket = p.match(/^(?:edit|open) ticket (?:sf[ -]?)?(\d{3,5})$/);
  if (ticket) return { type: 'edit_ticket', id: `SF-${ticket[1]}` };
  const confirmation = p.match(/^confirm send slack (?:for )?version (\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/);
  if (confirmation) return { type: 'confirm_slack', version: Number(confirmation[1]) || numberWords[confirmation[1]] };
  const github=p.match(/^confirm (?:create|publish) github (?:issues )?version (\d+|one|two|three|four|five|six|seven|eight|nine|ten)$/);
  if(github)return {type:'confirm_github',version:Number(github[1])||numberWords[github[1]]};
  const assignment=p.match(/^assign ticket (?:sf[ -]?)?(\d{3,5}) to ([a-z0-9-]{1,39})$/);
  if(assignment)return {type:'assign_external',id:`SF-${assignment[1]}`,login:assignment[2]};
  const selection=p.match(/^(select|deselect) ticket (?:sf[ -]?)?(\d{3,5})$/);
  if(selection)return {type:'select_ticket',id:`SF-${selection[2]}`,selected:selection[1]==='select'};
  const target = p.match(/^(?:show|open|go to|review) (?:the )?(brief|architecture|spec|specification|tickets|sprint|delivery|deliver)$/);
  if (target) return { type: 'navigate', stage: { brief: 0, architecture: 1, spec: 2, specification: 2, tickets: 3, sprint: 3, delivery: 4, deliver: 4 }[target[1]]! };
  return null;
}
export function changedReviews(before: SpecFlowState | null, after: SpecFlowState) {
  if (!before) return [1, 2, 3];
  if (JSON.stringify(before.prd) !== JSON.stringify(after.prd)) return [1, 2, 3];
  return [JSON.stringify(before.architecture) !== JSON.stringify(after.architecture) ? 1 : -1, JSON.stringify(before.prd) !== JSON.stringify(after.prd) ? 2 : -1, JSON.stringify(before.sprint) !== JSON.stringify(after.sprint) ? 3 : -1].filter(s => s > 0);
}
export function editSpecification(state: SpecFlowState, prd: SpecFlowState['prd']): SpecFlowState {
  if (!prd.problemStatement.trim() || !prd.functionalRequirements.length || prd.functionalRequirements.length > 30 || prd.functionalRequirements.some(r => !r.trim() || r.length > 12000)) throw Error('Provide a problem statement and up to 30 non-empty requirements.');
  const next = structuredClone(state);
  next.prd = structuredClone(prd); next.version++; next.timestamp = new Date().toISOString();
  next.voicePromptUsed = 'Edited specification during review';
  next.mutationSummary = 'Specification edited. Review related architecture and tickets for consistency.';
  return next;
}
export function canDeliver(state: SpecFlowState | null, reviewed: number[], approvedVersion: number | null) { return !!state && approvedVersion === state.version && [1, 2, 3].every(step => reviewed.includes(step)); }
export function editTicket(state: SpecFlowState, ticket: SprintTicket): SpecFlowState {
  if (!state.sprint.tickets.some(t => t.id === ticket.id)) throw Error('Ticket not found.');
  if (!ticket.title.trim() || !ticket.assignee.trim() || ticket.storyPoints < 1 || ticket.storyPoints > 40 || !Number.isInteger(ticket.storyPoints)) throw Error('Provide a title, owner and 1–40 story points.');
  const next = structuredClone(state);
  next.version++; next.timestamp = new Date().toISOString();
  next.voicePromptUsed = `Edited ${ticket.id}: ${ticket.title}`;
  next.mutationSummary = `${ticket.id} updated. Review its owner, priority and acceptance criteria.`;
  next.sprint.tickets = next.sprint.tickets.map(t => t.id === ticket.id ? { ...ticket, isModified: true, modificationNote: 'Updated during sprint review' } : { ...t, isModified: false });
  next.sprint.totalStoryPoints = next.sprint.tickets.reduce((sum, t) => sum + t.storyPoints, 0);
  next.comms.slackMessageMarkdown = `🚀 ${next.projectTitle}\n${next.executiveSummary}\n\n${next.sprint.tickets.map(t => `${t.id} · ${t.assignee} · ${t.priority} · ${t.storyPoints} pts — ${t.title}`).join('\n')}\n\nPlease review before implementation.`;
  return next;
}
