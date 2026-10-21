import test from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoSentences, extractOwners } from './brief-text';
import { localEngine } from './localEngine';
import { markdown, ticketCsv } from './export';
const brief = 'We need to build an automated dispute and refund triage system using Stripe, Postgres, and Slack. Whenever a customer requests a refund from the Next.js portal, check their order history in Postgres. If the refund is under 5,000 rupees and the account has zero prior disputes, trigger an instant refund via the Stripe API. If the refund is over 5,000 rupees or flagged as suspicious, pause the workflow and send an approval alert to the finance channel in Slack. Make sure we mask customer credit card and PII data in all logs and enforce idempotency keys on Stripe calls so we never double-refund. Assign the Postgres and Stripe backend to Ananya, the Next.js portal to Kartik, and the Slack approval webhook to Mira.';
test('technical names, file extensions and decimals survive sentence tokenization',()=>{
 const parts=splitIntoSentences('Use Next.js and Node.js with Vue.js. Read config.ts, data.json and version v1.2. Reject amounts above 1250.50 dollars!');
 assert.equal(parts.length,3);assert.match(parts[0],/Next\.js.*Node\.js.*Vue\.js/);assert.match(parts[1],/config\.ts.*data\.json.*v1\.2/);assert.match(parts[2],/1250\.50/);
});
test('multi-clause assignments preserve compound scopes and dictated identities',()=>{
 assert.deepEqual(extractOwners(splitIntoSentences(brief)),[{name:'Ananya',scope:'Postgres and Stripe backend'},{name:'Kartik',scope:'Next.js portal'},{name:'Mira',scope:'Slack approval webhook'}]);
 assert.deepEqual(extractOwners(['Assign backend to Ananya and the portal to Meera']),[{name:'Ananya',scope:'backend'},{name:'Meera',scope:'portal'}]);
});
test('refund architecture uses components and one decision without hiding predicate gaps',()=>{
 const s=localEngine(brief),code=s.architecture.mermaidCode;
 assert.equal(s.architecture.nodes.filter(n=>n.id.startsWith('DEC')&&!n.id.includes('_')).length,1);
 assert.doesNotMatch(code,/next requirement|Other outcome|Assign |Kartik|Ananya|Mira/);
 for(const text of ['Next.js','Postgres','Stripe','Slack','Idempotency'])assert.ok(code.includes(text),text);
 assert.ok(s.architecture.nodes.every(n=>n.label.length<=36));
 assert.match(code,/0 disputes/);assert.match(s.prd.edgeCases.join(' '),/equality boundary/);assert.match(code,/Unspecified cases/);
 assert.match(s.prd.functionalRequirements.join(' '),/under 5,000.*zero prior disputes/);
 assert.match(s.prd.functionalRequirements.join(' '),/over 5,000.*suspicious/);
 assert.equal(s.sprint.tickets.filter(t=>t.assignee==='Kartik').length,1);
 assert.match(s.sprint.tickets.find(t=>t.assignee==='Kartik')!.title,/Next\.js/);
 assert.equal(s.sprint.tickets.filter(t=>t.assignee==='Mira').length,1);
 assert.ok(s.sprint.tickets.some(t=>t.category==='Security'&&/PII/.test(t.title)));
 assert.ok(s.prd.apiContracts.some(a=>a.endpoint==='/api/webhooks/slack-approval'));
 assert.match(markdown(s),/Security & reliability guardrails/);assert.match(ticketCsv(s),/Next\.js/);
});
test('explicit otherwise uses no branch; single condition proposes review instead of inventing business behavior',()=>{
 const s=localEngine('Build a claims portal. If a claim is valid, approve the claim. Otherwise reject the claim.');
 assert.equal(s.architecture.nodes.filter(n=>n.id.startsWith('DEC')&&!n.id.includes('_')).length,1);assert.match(s.architecture.mermaidCode,/\|No\|/);assert.doesNotMatch(s.architecture.mermaidCode,/rule gaps/);
 const single=localEngine('Build a claims portal. If a claim is valid, approve the claim.');assert.match(single.architecture.mermaidCode,/Manual Review/);assert.match(single.prd.edgeCases.join(' '),/proposed safeguard/);
});
test('Redis refinement preserves decisions, owners and source rules',()=>{
 const s=localEngine(brief),next=localEngine('Add a Redis retry queue before Stripe.',s);
 assert.match(next.architecture.mermaidCode,/REDIS --> DEC1_YES/);assert.equal(next.sprint.tickets.find(t=>t.assignee==='Mira')?.title,s.sprint.tickets.find(t=>t.assignee==='Mira')?.title);assert.deepEqual(next.prd.functionalRequirements.slice(0,s.prd.functionalRequirements.length),s.prd.functionalRequirements);assert.match(next.prd.functionalRequirements.at(-1)!,/Redis/);assert.equal(s.version,1);assert.equal(next.version,2);
});
