import { SpecFlowState, SpecNode, SprintTicket } from '@/types/specflow';
import { splitIntoSentences, extractOwners, isAssignment, isGuardrail, toComponentLabel } from './brief-text';
const safe = (s: string) => s.replace(/["<>\[\]{}|`\\]/g, '').replace(/[\r\n]/g, ' ').trim();
type Rule = { condition: string; action: string; source: string };
export function planBrief(state: SpecFlowState, prompt: string): SpecFlowState {
  const sentences = splitIntoSentences(prompt), owners = extractOwners(sentences);
  const guards = sentences.filter(isGuardrail), requirements = sentences.filter(s => !isAssignment(s));
  const review = ['Local component architecture is a proposal. Verify component connections and business rules before implementation.', 'Story points and API contracts are proposals. Unspecified owners remain unassigned.'];
  const nodes: SpecNode[] = [], lines = ['graph TD'];
  const add = (id: string, label: string, type: SpecNode['type'] = 'service', decision = false) => {
    if (!nodes.some(n => n.id === id)) {
      label = safe(label).slice(0, 36); nodes.push({ id, label, type, tech: 'From brief / proposed' });
      lines.push(type === 'db' ? `  ${id}[("${label}")]` : decision ? `  ${id}{"${label}"}` : `  ${id}["${label}"]`);
    }
    return id;
  };
  const edge = (from: string, to: string, label = '') => lines.push(`  ${from} -->${label ? `|${safe(label).slice(0, 50)}|` : ''} ${to}`);
  const content = sentences.filter(s => !isAssignment(s)).join(' ');
  const portal = /next\.js/i.test(content) ? 'Next.js Customer Portal' : /portal|frontend|app\b/i.test(content) ? 'Request Portal' : 'Request / Event Intake';
  add('INPUT', portal, 'ingest');
  add('ENGINE', /dispute|refund/i.test(content) ? 'Dispute & Refund Triage Service' : toComponentLabel(state.projectTitle) || 'Workflow Service');
  edge('INPUT', 'ENGINE', 'Request');
  const technologies: [RegExp, string, string, SpecNode['type']][] = [
    [/postgres/i,'DB',/order history|refund/i.test(content)?'Postgres Order History DB':'Postgres Workflow Records','db'],[/mongodb/i,'MONGO','MongoDB Workflow Records','db'],[/supabase/i,'SUPABASE','Supabase Workflow Records','db'],[/kafka/i,'KAFKA','Kafka Event Stream','queue'],[/redis/i,'REDIS','Redis Retry & Rate-Limit Queue','queue']
  ];
  let anchor = 'ENGINE';
  for (const [pattern,id,label,type] of technologies) if (pattern.test(content)) { add(id, label, type); edge(anchor,id,'Context / proposed dependency'); anchor=id; }
  if (guards.length) { add('GUARD', /mask|pii|credit card|idempotenc/i.test(guards.join(' ')) ? 'PII Masking & Idempotency Guard' : 'Security & Reliability Guard'); edge(anchor,'GUARD'); anchor='GUARD'; }
  const action = (raw: string, id: string) => {
    const label = /slack/i.test(raw) ? (/finance/i.test(raw) ? 'Slack Finance Approval Alert' : 'Slack Notification / Approval') : /stripe/i.test(raw) ? 'Stripe Instant Refund API' : /razorpay/i.test(raw) ? 'Razorpay Payment API' : /whatsapp/i.test(raw) ? 'WhatsApp Notification' : toComponentLabel(raw);
    return add(id, label || 'Workflow Action', /slack|stripe|razorpay|whatsapp|webhook|email/i.test(raw) ? 'external' : 'service');
  };
  const rules: Rule[] = [], remaining: string[] = [];
  for (const s of requirements.filter(s => !isGuardrail(s))) {
    const conditional = s.match(/^(?:if|unless|when the)\s+(.+?)(?:,(?!\d)\s*|\s+then\s+)(.+)$/i);
    const threshold = s.match(/^(.+?\b(?:approv\w*|review\w*|reject\w*|escalat\w*)\b.*?)\s+((?:above|over|below|under|at least|more than|less than|exceeding)\s+.+)$/i);
    if (conditional) rules.push({condition:(/^unless/i.test(s)?'Not: ':'')+conditional[1],action:conditional[2],source:s});
    else if (threshold) rules.push({condition:threshold[2],action:threshold[1],source:s});
    else if (/^otherwise\b/i.test(s) && rules.length) rules.push({condition:'Otherwise',action:s.replace(/^otherwise\s*/i,''),source:s});
    else remaining.push(s);
  }
  const consumed = new Set<number>();
  for (let i=0;i<rules.length;i++) {
    if(consumed.has(i))continue;
    const rule=rules[i], amount=rule.condition.match(/\d[\d,.]*/)?.[0];
    const subject=(condition:string)=>condition.toLowerCase().split(/\b(?:under|below|less than|over|above|exceeds?|exceeding|more than)\b/)[0].replace(/\b(?:the|is|must|be)\b/g,'').trim();
    const other=rules.findIndex((r,j)=>j>i&&!consumed.has(j)&&(r.condition==='Otherwise'||(!!amount&&r.condition.includes(amount)&&subject(r.condition)===subject(rule.condition)&&((/under|below|less than/i.test(rule.condition)&&/over|above|exceed|more than/i.test(r.condition))||(/over|above|exceed|more than/i.test(rule.condition)&&/under|below|less than/i.test(r.condition))))));
    const conditionLabel=rule.condition.replace(/\bthe\s+/gi,'').replace(/\bis\s+/gi,'').replace(/([\d,]+)\s+rupees/gi,'₹$1').replace(/\band\s+(?:account\s+)?has\s+zero\s+prior\s+disputes/gi,'& 0 disputes');
    const id=`DEC${i+1}`;add(id,conditionLabel+'?','service',true);edge(anchor,id);edge(id,action(rule.action,`${id}_YES`),'Yes');
    if(other>=0){consumed.add(other);edge(id,action(rules[other].action,`${id}_NO`),rules[other].condition==='Otherwise'?'No':'Explicit exception rule');
      if(rules[other].condition!=='Otherwise') { add(`${id}_REVIEW`,'Manual Review (rule gaps)','human');edge(id,`${id}_REVIEW`,'Unspecified cases');review.push(`Confirm equality boundary, overlapping and unmatched cases between: ${rule.source} / ${rules[other].source}. These predicates are not necessarily logical complements.`); }
    } else {add(`${id}_NO`,'Manual Review / Escalation','human');edge(id,`${id}_NO`,'No / proposed review');review.push(`Confirm the opposite outcome and equality boundary for: ${rule.source}. Manual review is a proposed safeguard, not a supplied business rule.`);}
  }
  for(const [i,s] of remaining.entries()) {
    if(/^(?:we need to )?(?:build|create|make|design)\b/i.test(s))continue;
    const before=s.match(/^(.+?)\s+before\s+(.+)$/i);
    if(before){const a=action(before[1],`STEP${i}_A`),b=action(before[2],`STEP${i}_B`);edge('ENGINE',a);edge(a,b,'before');}
    else if(!/^(?:whenever|when a|first)\b/i.test(s)&&/check|query|fetch|validat|certif|membership|notify|send|remind|reject|expire|reserv/i.test(s)){const id=action(s,`STEP${i}`);edge('ENGINE',id,'Proposed responsibility');}
  }
  const tokens=(s:string)=>s.toLowerCase().split(/[^\p{L}\d]+/u).filter(w=>w.length>3&&!['request','requests','task','tasks','backend'].includes(w)).map(w=>w.replace(/^approv\w*/,'approv').replace(/s$/,''));
  const related=(a:string,b:string)=>tokens(a).some(w=>tokens(b).includes(w));
  const tickets:SprintTicket[]=[];
  const ticket=(scope:string,owner:string,sources:string[])=>{
    const security=isGuardrail(scope), title=/refund/i.test(content)&&/postgres|stripe/i.test(scope)?'Postgres Verification & Idempotent Stripe Refund Backend':/refund/i.test(content)&&/next\.js|portal/i.test(scope)?'Next.js Refund Request Portal & Status UI':/refund/i.test(content)&&/slack/i.test(scope)?'Slack Finance Approval Webhook & Workflow Hold':safe(scope).slice(0,110);
    tickets.push({id:`SF-${101+tickets.length}`,title,assignee:owner,priority:'P1 - High',storyPoints:3,category:security?'Security':/portal|frontend|next\.js|form/i.test(scope)?'Frontend':/postgres|database/i.test(scope)&&!/stripe|backend/i.test(scope)?'Database':'Backend',description:`Source requirement: ${sources.join('\n')}\nScope: ${scope}. Implementation and estimate require review.`,acceptanceCriteria:[...sources.map(s=>`Verify: ${s}`),'Verify boundary cases, authorization and downstream failures before release.'],status:'todo'});
  };
  for(const o of owners){const sources=requirements.filter(s=>related(o.scope,s));ticket(o.scope,o.name,sources.length?sources:[o.scope]);}
  for(const s of requirements.filter(s=>!isGuardrail(s)&&!/^(?:we need to )?(?:build|create|make|design)\b/i.test(s))) if(!owners.some(o=>related(o.scope,s)))ticket(s,'Unassigned',[s]);
  if(guards.length)ticket(/pii|mask|credit card|idempotenc/i.test(guards.join(' '))?'PII Masking & Idempotency Middleware':'Security & Reliability Controls','Unassigned',guards);
  if(!tickets.length)ticket(state.projectTitle,'Unassigned',requirements);
  if(!owners.length)review.push('No explicit task owners were found. Assign people in the ticket editor.');
  review.push('Dictated names are preserved exactly. Confirm spelling and map them to actual GitHub accounts before delivery.');
  const guardLabels:string[]=[];
  for(const g of guards){if(/mask|pii|credit card/i.test(g))guardLabels.push('PII & credit-card log redaction');if(/idempotenc|duplicate|never double/i.test(g))guardLabels.push('Idempotency & duplicate prevention');if(/audit/i.test(g))guardLabels.push('Audit trail');if(/encrypt/i.test(g))guardLabels.push('Encryption');if(!/mask|pii|credit card|idempotenc|duplicate|never double|audit|encrypt/i.test(g))guardLabels.push(toComponentLabel(g));}
  state.architecture={nodes,mermaidCode:lines.join('\n')+'\n',securityGuardrails:[...new Set(guardLabels)]};
  state.executiveSummary=`Proposed component architecture for ${state.projectTitle}. Connections are draft dependencies; exact source rules and unresolved boundaries are retained in the specification.`;
  state.prd.problemStatement=requirements.filter(s=>/^(?:we need to )?(?:build|create|make|design)\b/i.test(s)).join(' ')||state.projectTitle;
  state.prd.functionalRequirements=requirements;
  state.prd.userStories=['As a requester, I can submit a request and inspect its outcome.','As an authorized reviewer, I can inspect the source rules and resolve exceptions.'];
  state.prd.edgeCases=[...review,...rules.map(r=>`Test the stated condition and its boundary: ${r.source}`),...guards.map(g=>`Verify security and retry behavior: ${g}`)];
  if(/refund/i.test(content))state.prd.apiContracts=[{method:'POST',endpoint:'/api/refunds/request',description:'Proposed: validate an authenticated refund request and return its tracked status.'},...(/stripe/i.test(content)?[{method:'POST' as const,endpoint:'/api/refunds/stripe-execute',description:'Proposed internal operation: revalidate eligibility and approval, attach idempotency key, mask sensitive logs.'}]:[]),...(/slack/i.test(content)?[{method:'POST' as const,endpoint:'/api/webhooks/slack-approval',description:'Proposed: verify provider signature, reviewer authorization and replay protection before recording approval/rejection.'}]:[])];
  state.sprint.tickets=tickets;
  return state;
}
