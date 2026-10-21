import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localEngine} from './localEngine';
import {INVOICE_DEMO} from '../types/specflow';
test('invoice preset and immutable voice mutations',()=>{const initial=localEngine(INVOICE_DEMO);assert.equal(initial.sprint.totalStoryPoints,15);const patched=localEngine('Add Redis retry queue, WhatsApp and GDPR. Bump Ananya to P0 with 8 points.',initial);assert.equal(patched.version,2);assert.equal(initial.architecture.nodes.length,5);assert.equal(patched.architecture.nodes.length,7);assert.equal(patched.sprint.tickets.find(t=>t.assignee==='Ananya')?.priority,'P0 - Critical');assert.equal(patched.sprint.tickets[1].storyPoints,8);assert.match(patched.architecture.mermaidCode,/CHECK -->\|Yes\| REDIS --> PAY/);assert.equal(localEngine('add redis and whatsapp',patched).architecture.nodes.length,7);});
test('custom briefs preserve integrations without inventing owners',()=>{const s=localEngine('Build a shipment tracking portal. Use Kafka and MongoDB. Notify customers on delivery.');assert.match(s.projectTitle,/shipment tracking/);assert.match(s.architecture.mermaidCode,/MongoDB/);assert.match(s.architecture.mermaidCode,/Kafka/);assert.ok(s.sprint.tickets.every(t=>t.assignee==='Unassigned'));});

test('equipment rules preserve threshold, dependency and scoped owners',()=>{
 const s=localEngine('Build an employee equipment request portal. Employees request laptops or monitors. Managers must approve requests above 40,000 rupees. IT checks inventory before buying equipment. Use Postgres and Slack notifications. Priya owns the request form, Ananya owns approvals, and Meera owns inventory. Prevent duplicate active requests and keep an audit trail.');
 assert.match(s.architecture.mermaidCode,/\{"above ₹40,000\?"\}/);
 assert.match(s.architecture.mermaidCode,/\|Yes\|/);
 assert.match(s.architecture.mermaidCode,/--\>\|before\|/);
 assert.equal(s.sprint.tickets.find(t=>/Managers/.test(t.description))?.assignee,'Ananya');
 assert.equal(s.sprint.tickets.find(t=>/inventory/.test(t.title))?.assignee,'Meera');
 assert.equal(s.sprint.tickets.find(t=>t.title==='request form')?.assignee,'Priya');
 assert.ok(s.sprint.tickets.every(t=>t.assignee!=='Karthik'));
 assert.ok(s.prd.edgeCases.some(t=>/equality boundary/.test(t)));
});

test('unseen domains keep their own conditions, numbers and dependencies',()=>{
 for(const brief of ['Build a claims portal. If a claim exceeds 1250.50 dollars, route it to a reviewer. Verify identity before issuing payment.','Build a lab tracker. If temperature is below -20 degrees, alert the technician. Check calibration before running samples.','Build a library portal. Librarians must approve loans over 8 books. Check membership before issuing books.']){
  const s=localEngine(brief);assert.match(s.architecture.mermaidCode,/\{/);assert.match(s.architecture.mermaidCode,/\|before\|/);assert.ok(s.prd.functionalRequirements.some(r=>/before/.test(r)));assert.ok(s.sprint.tickets.every(t=>t.description.includes('Source requirement:')));assert.doesNotMatch(s.architecture.mermaidCode,/5%|Razorpay|equipment|inventory/);
 }
});

test('invoice keywords do not activate a fixed finance template',()=>{
 const s=localEngine('Build an invoice tracker. Managers must approve invoices above 900 euros.');assert.match(s.architecture.mermaidCode,/900 euros/);assert.doesNotMatch(s.architecture.mermaidCode,/5%|GSTIN|Razorpay/);
});
