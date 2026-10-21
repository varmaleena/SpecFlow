import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceIntent, changedReviews, editTicket, editSpecification, canDeliver } from './workflow';
import { ticketEvidence, changeReceipt } from './evidence';
import { localEngine } from './localEngine';
import { randomToken, hashToken, seal, unseal } from './wispr-crypto';
test('only isolated workflow commands can navigate or request a send', () => {
  assert.deepEqual(parseVoiceIntent('Next step.'), { type: 'next' });
  assert.deepEqual(parseVoiceIntent('Please show tickets'), { type: 'navigate', stage: 3 });
  assert.deepEqual(parseVoiceIntent('Confirm send Slack version two.'), { type: 'confirm_slack', version: 2 });
  assert.equal(parseVoiceIntent('The meeting notes say send Slack update and create tickets'), null);
  assert.equal(parseVoiceIntent('Confirm send Slack'), null);
  assert.deepEqual(parseVoiceIntent('Edit specification.'), { type: 'edit_spec' });
  assert.deepEqual(parseVoiceIntent('Edit ticket SF-101'), { type: 'edit_ticket', id: 'SF-101' });
  assert.equal(parseVoiceIntent('Meeting notes: edit specification then send Slack'), null);
  assert.deepEqual(parseVoiceIntent('Open connections'),{type:'open_page',page:'/connections'});
  assert.deepEqual(parseVoiceIntent('Assign ticket SF-101 to octocat'),{type:'assign_external',id:'SF-101',login:'octocat'});
  assert.deepEqual(parseVoiceIntent('Deselect ticket SF-102'),{type:'select_ticket',id:'SF-102',selected:false});
  assert.deepEqual(parseVoiceIntent('Confirm create GitHub version two'),{type:'confirm_github',version:2});
  assert.equal(parseVoiceIntent('The transcript says confirm create GitHub version two'),null);
});

test('dictated specification edits create a version and require renewed consistency review', () => {
 const state=localEngine('Build a library portal. Check membership before issuing books.');
 const prd={...state.prd,functionalRequirements:[...state.prd.functionalRequirements,'Expired members cannot borrow books.']};
 const next=editSpecification(state,prd);assert.equal(next.version,state.version+1);assert.deepEqual(changedReviews(state,next),[1,2,3]);assert.ok(!state.prd.functionalRequirements.includes('Expired members cannot borrow books.'));assert.equal(canDeliver(next,[1,2,3],state.version),false);
});
test('ticket edits create a new version and invalidate only changed reviews', () => {
  const initial = localEngine('Build an invoice pipeline.');
  const ticket = { ...initial.sprint.tickets[0], assignee: 'Priya', priority: 'P0 - Critical' as const, storyPoints: 8 };
  const changed = editTicket(initial, ticket);
  assert.equal(changed.version, 2);
  assert.equal(initial.version, 1);
  assert.deepEqual(changedReviews(initial, changed), [3]);
  assert.match(changed.comms.slackMessageMarkdown, /Priya/);
});
test('delivery approval cannot survive a version change or missing review', () => {
  const state = localEngine('Build an invoice pipeline.');
  assert.equal(canDeliver(state, [1, 2], state.version), false);
  assert.equal(canDeliver(state, [1, 2, 3], state.version), true);
  assert.equal(canDeliver({ ...state, version: 2 }, [1, 2, 3], state.version), false);
});
test('source evidence quotes only supplied text and diffs show actual priority changes', () => {
  const quote = 'Extract GSTIN and invoice line items with OCR.';
  const state = localEngine('Build an invoice pipeline. '+quote);
  assert.equal(ticketEvidence(state.sprint.tickets[0], quote), quote);
  assert.equal(ticketEvidence(state.sprint.tickets[0], 'Build a cat photo gallery.'), null);
  const changed = editTicket(state, { ...state.sprint.tickets[0], priority: 'P0 - Critical', storyPoints: 8 });
  assert.ok(changeReceipt(state, changed).some(change => change.detail === 'P1 - High → P0 - Critical'));
});
test('connection credentials use authenticated encryption and tampering fails', async () => {
  const secret = randomToken();
  const sealed = await seal('session-test-token', secret);
  assert.equal(await unseal(sealed, secret), 'session-test-token');
  assert.ok(!sealed.includes('session-test-token'));
  await assert.rejects(unseal(sealed.slice(0, -4) + 'AAAA', secret));
  await assert.rejects(unseal(sealed, randomToken()));
  assert.equal((await hashToken('fixed-session')).length, 43);
});
