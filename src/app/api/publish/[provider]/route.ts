import { authenticatedUser,firestore } from '@/lib/firebase-admin';
import { provider,connectionForDelivery,github } from '@/lib/connections';
import { validState } from '@/lib/ai';
import type { SpecFlowState } from '@/types/specflow';
import { once,RejectedRequest,PublishReceipt } from '@/lib/publish';
export const dynamic='force-dynamic';
export const maxDuration=60;
type Context={params:Promise<{provider:string}>};
export async function POST(request:Request,context:Context){
 try{
  const user=await authenticatedUser(request),p=provider((await context.params).provider),raw=await request.text();if(raw.length>150000)return Response.json({error:'Project too large.'},{status:413});
  const body=JSON.parse(raw);if(!validState(body.state)||body.confirmation!==`${p}:v${body.state.version}`)return Response.json({error:'Review and confirm the current plan version.'},{status:400});
  const state=body.state as SpecFlowState,connection=await connectionForDelivery(user.uid,p),db=firestore()!;
  if(body.destination!==connection.destination.id)return Response.json({error:'The destination changed. Reopen the delivery preview.'},{status:409});
  const receipts:PublishReceipt[]=[],started=Date.now();let expected=1;
  if(p==='slack'){
   if(typeof body.text!=='string'||!body.text.trim()||body.text.length>12000)return Response.json({error:'Provide the reviewed announcement.'},{status:400});
   const result=await once(db,JSON.stringify([user.uid,p,connection.destination.id,state.version,body.text]),async()=>{
    const r=await fetch('https://slack.com/api/chat.postMessage',{method:'POST',headers:{Authorization:`Bearer ${connection.access}`,'Content-Type':'application/json'},body:JSON.stringify({channel:connection.destination.id,text:body.text,unfurl_links:false,unfurl_media:false}),signal:AbortSignal.timeout(15000)});
    if(r.status>=400&&r.status<500)throw new RejectedRequest();if(!r.ok)throw Error('Uncertain provider response.');const data=await r.json();if(!data.ok)throw new RejectedRequest();if(!data.ts||data.channel!==connection.destination.id)throw Error('Uncertain provider response.');
    let url=connection.destination.url;
    try{const link=await fetch(`https://slack.com/api/chat.getPermalink?channel=${encodeURIComponent(data.channel)}&message_ts=${encodeURIComponent(data.ts)}`,{headers:{Authorization:`Bearer ${connection.access}`},signal:AbortSignal.timeout(5000)});const value=await link.json();if(link.ok&&value.ok&&typeof value.permalink==='string'&&new URL(value.permalink).protocol==='https:')url=value.permalink;}catch{}
    return{externalId:data.ts,...(url?{url}:{})};
   },{uid:user.uid,provider:p,projectTitle:state.projectTitle,version:state.version,destination:connection.destination.label});receipts.push(result);
  }else{
   if(!/^[\w.-]+\/[\w.-]+$/.test(connection.destination.id)||!Array.isArray(body.ticketIds)||body.ticketIds.length<1||body.ticketIds.length>10||new Set(body.ticketIds).size!==body.ticketIds.length)return Response.json({error:'Select one to ten tickets.'},{status:400});
   const tickets=state.sprint.tickets.filter(t=>body.ticketIds.includes(t.id));if(tickets.length!==body.ticketIds.length)return Response.json({error:'The selected tickets changed.'},{status:400});
   expected=tickets.length;
   const assignable=await github(connection.access,`/repos/${connection.destination.id}/assignees?per_page=100`),logins=new Set((assignable as {login:string}[]).map(u=>u.login));
   for(const ticket of tickets){

    const login=body.assignments?.[ticket.id];if(login&&!logins.has(login))return Response.json({error:'An assignee is not available in this repository.'},{status:400});
   }
   for(const ticket of tickets){
    if(Date.now()-started>40000)break;
    const login=body.assignments?.[ticket.id],content={title:ticket.title,body:`SpecFlow ${ticket.id} · plan v${state.version}\nDraft owner: ${ticket.assignee}\nPriority: ${ticket.priority} · Estimate: ${ticket.storyPoints} points\n\n${ticket.description}\n\nAcceptance criteria\n${ticket.acceptanceCriteria.map(item=>`- [ ] ${item}`).join('\n')}`,...(login?{assignees:[login]}:{})};
    const receipt=await once(db,JSON.stringify([user.uid,p,connection.destination.id,state.version,ticket.id,content]),async()=>{const r=await fetch(`https://api.github.com/repos/${connection.destination.id}/issues`,{method:'POST',headers:{Authorization:`Bearer ${connection.access}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify(content),signal:AbortSignal.timeout(15000)});if(r.status>=400&&r.status<500)throw new RejectedRequest();if(!r.ok)throw Error('Uncertain provider response.');const data=await r.json();if(!data.number||typeof data.html_url!=='string'||new URL(data.html_url).hostname!=='github.com')throw Error('Uncertain issue result.');return{externalId:String(data.number),url:data.html_url};},{uid:user.uid,provider:p,projectTitle:state.projectTitle,version:state.version,destination:connection.destination.label,ticketId:ticket.id});
    receipts.push(receipt);if(receipt.state!=='sent')break;
   }
  }
  return Response.json({ok:receipts.length===expected&&receipts.every(r=>r.state==='sent'),receipts},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'Delivery could not start. Check sign-in, account connection and selected destination.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
