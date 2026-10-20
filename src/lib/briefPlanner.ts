import { SpecFlowState, SpecNode, SprintTicket } from '@/types/specflow';

// A conservative, domain-independent fallback. It preserves source clauses;
// it never claims that keyword extraction is full semantic understanding.
const safe = (s: string) => s.replace(/["<>\[\]{}|`\\]/g, '').replace(/[\r\n]/g, ' ').trim();
const short = (s: string) => safe(s).slice(0, 180);
export function planBrief(state: SpecFlowState, prompt: string): SpecFlowState {
  const sentences = prompt.split(/[!?;\n]+|\.(?!\d)/).map(s => s.trim()).filter(Boolean);
  const owners = [...prompt.matchAll(/\b([A-Z][\p{L}'-]*(?:\s+[A-Z][\p{L}'-]*)?)\s+(?:owns|leads|is responsible for)\s+(.+?)(?=,\s*(?:and\s+)?[A-Z][\p{L}'-]*\s+(?:owns|leads|is responsible)|[.;\n]|$)/gu)].map(m => ({ name: m[1], scope: m[2].replace(/^the\s+/i, '') }));
  for (const m of prompt.matchAll(/\bassign\s+(.+?)\s+to\s+([A-Z][\p{L}'-]*)(?=[,.;\n]|$)/giu)) owners.push({ name: m[2], scope: m[1].replace(/^the\s+/i, '') });
  const requirements = sentences.filter(s => !/\b(?:owns|leads|is responsible for)\b/i.test(s) && !/^assign\b/i.test(s) && (!/^(?:build|create|make|design)\b/i.test(s) || /\b(using|with|that|where|if|when|before|after|above|below|and)\b/i.test(s)));
  if (!requirements.length) requirements.push(sentences[0] || prompt);
  const review = ['Local draft: quoted requirements are preserved, but business semantics and unlabelled relationships need human review.', 'Story points and API contracts are proposals. Unspecified owners remain unassigned.'];
  const nodes: SpecNode[] = [{ id: 'INPUT', label: 'Request / event intake', type: 'ingest', tech: 'Proposed interface' }];
  let code = 'graph TD\n  INPUT["Request / event intake"]\n', anchor = 'INPUT';
  const add = (id: string, label: string, type: SpecNode['type'] = 'service', decision = false) => {
    nodes.push({ id, label: short(label), type, tech: 'From brief' });
    code += decision ? `  ${id}{"${short(label)}"}\n` : `  ${id}["${short(label)}"]\n`;
    return id;
  };
  const ownerFor = (text: string) => {
    const stem = (w: string) => w.toLowerCase().replace(/^approv\w*/, 'approv').replace(/s$/, '');
    const words = text.toLowerCase().split(/\W+/).map(stem);
    const matches = owners.filter(o => {
      const scope = o.scope.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !['request', 'requests', 'task', 'tasks'].includes(w)).map(stem);
      return scope.length > 0 && scope.some(w => words.includes(w));
    });
    return matches.length === 1 ? matches[0].name : 'Unassigned';
  };
  const tickets: SprintTicket[] = [];
  const makeTicket = (text: string, owner = ownerFor(text)) => {
    const security = /audit|mask|encrypt|permission|access control|privacy/i.test(text);
    tickets.push({ id: `SF-${101 + tickets.length}`, title: short(text), assignee: owner, priority: 'P1 - High', storyPoints: 3, category: security ? 'Security' : /form|portal|screen|interface/i.test(text) ? 'Frontend' : 'Backend', description: `Source requirement: ${text}\nImplementation and estimate require review.`, acceptanceCriteria: [`Demonstrate the stated behavior: ${text}`, 'Verify the corresponding failure or boundary case with the product owner before implementation.'], status: 'todo' });
  };
  for (const [i, sentence] of requirements.slice(0, 12).entries()) {
    const id = `R${i + 1}`;
    // Preserve conditional wording and numeric boundaries exactly, including currency.
    const conditional = sentence.match(/^(?:if|when|unless)\s+(.+?)(?:,(?!\d)\s*|\s+then\s+)(.+)$/i);
    const threshold = sentence.match(/^(.+?\b(?:approv\w*|review\w*|reject\w*|escalat\w*)\b.*?)\s+((?:above|over|below|under|at least|more than|less than|exceeding)\s+.+)$/i);
    const after = sentence.match(/^(.+?)\s+before\s+(.+)$/i);
    if (conditional) {
      add(id, conditional[1], 'service', true);
      add(`${id}_YES`, conditional[2]);
      add(`${id}_NO`, 'Other outcome — confirm behavior', 'human');
      const unless = /^unless\b/i.test(sentence);
      code += `  ${anchor} -.->|next requirement| ${id}\n  ${id} -->|${unless ? 'Does not match' : 'Matches'}| ${id}_YES\n  ${id} -->|${unless ? 'Matches' : 'Otherwise'}| ${id}_NO\n`;
      review.push(`Confirm the opposite outcome and ordering for: ${sentence}`);
    } else if (threshold) {
      add(id, threshold[2] + '?', 'service', true);
      add(`${id}_YES`, threshold[1], 'human');
      add(`${id}_NO`, 'Threshold not met — continue review', 'human');
      code += `  ${anchor} -.->|next requirement| ${id}\n  ${id} -->|Yes| ${id}_YES\n  ${id} -->|No| ${id}_NO\n`;
      review.push(`Confirm equality boundary and rejection behavior for: ${sentence}`);
    } else if (after) {
      add(id, after[1]); add(`${id}_AFTER`, after[2]);
      code += `  ${anchor} -.->|next requirement| ${id}\n  ${id} -->|before| ${id}_AFTER\n`;
    } else {
      const isData = /\b(postgres|mongodb|supabase|database)\b/i.test(sentence);
      add(id, sentence, isData ? 'db' : /\b(slack|email|sms|webhook|notify)\b/i.test(sentence) ? 'external' : 'service');
      code += `  ${anchor} -.->|next requirement| ${id}\n`;
      if (/\b(if|when|unless|otherwise|above|below|after|only|except|within)\b/i.test(sentence)) review.push(`Complex condition retained as text; confirm its branches: ${sentence}`);
    }
    anchor = after && !conditional && !threshold ? `${id}_AFTER` : id;
    makeTicket(sentence);
  }
  // Ownership clauses are requirements too, rather than names assigned by array position.
  for (const owner of owners.slice(0, 20)) {
    const existing = tickets.filter(t => ownerFor(t.title) === owner.name);
    if (existing.length) existing.forEach(t => { t.assignee = owner.name; });
    else makeTicket(owner.scope, owner.name);
  }
  if (requirements.length > 12) review.push(`${requirements.length - 12} further requirements are preserved in the source brief but need diagram expansion.`);
  if (owners.length > 20) review.push('Additional ownership clauses need review in the original brief.');
  if (!owners.length) review.push('No explicit task owners were found. Assign people in the ticket editor.');
  state.architecture = { nodes, mermaidCode: code, securityGuardrails: sentences.filter(s => /audit|mask|encrypt|privacy|permission|duplicate|authenticat/i.test(s)).map(short) };
  state.executiveSummary = `Local requirements map for ${state.projectTitle}. Dotted connections show requirements, not inferred execution order. Solid connections represent explicit conditions or “before” dependencies. Review unresolved outcomes before implementation.`;
  state.prd.problemStatement = prompt;
  state.prd.functionalRequirements = [...requirements.slice(0, 30), ...owners.slice(0, 20).map(o => `${o.name} owns ${o.scope}.`)];
  state.prd.userStories = ['As a requester, I can complete the workflow described in the source brief.', 'As a reviewer, I can verify each source requirement and resolve unspecified behavior.'];
  state.prd.edgeCases = review;
  state.sprint.tickets = tickets;
  return state;
}
