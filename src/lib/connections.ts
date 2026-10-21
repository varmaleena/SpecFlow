import { authenticatedUser, firestore } from './firebase-admin';
import { APP_ORIGIN } from './server-runtime';
import { hashToken, randomToken, seal, unseal } from './wispr-crypto';
export type Provider = 'github' | 'slack';
export type Destination = { id: string; label: string; url?: string };
export function provider(value: string): Provider { if(value!=='github'&&value!=='slack')throw Error('Unsupported connection.');return value; }
const secret=()=>{const key=process.env.CONNECTOR_TOKEN_ENCRYPTION_KEY||process.env.FLOW_TOKEN_ENCRYPTION_KEY;if(!key)throw Error('Connector encryption is not configured.');return key;};
function credentials(p:Provider){const prefix=p.toUpperCase(),id=process.env[`${prefix}_CLIENT_ID`],key=process.env[`${prefix}_CLIENT_SECRET`];if(!id||!key)throw Error(`${p==='github'?'GitHub':'Slack'} OAuth application setup is pending.`);return{id,key};}
function owner(uid:string,p:Provider){const db=firestore();if(!db)throw Error('Firebase server configuration is missing.');return db.collection('specflow_users').doc(uid).collection('connections').doc(p);}
function configured(p:Provider){try{credentials(p);secret();return !!firestore();}catch{return false;}}
function callback(p:Provider){return `${APP_ORIGIN}/api/connections/${p}/callback`;}
function cookieName(p:Provider){return `__Host-specflow-connect-${p}`;}
function cookie(p:Provider,value:string,age=600){return `${cookieName(p)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`;}
function cookieValue(request:Request,p:Provider){return request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(p)+'='))?.slice(cookieName(p).length+1);}
const json=(body:unknown,status=200,headers:Record<string,string>={})=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',...headers}});
export async function connectionStatus(request:Request){
 const user=await authenticatedUser(request);const result:Record<string,unknown>={};
 for(const p of ['github','slack'] as Provider[]){const doc=await owner(user.uid,p).get(),data=doc.data();result[p]={configured:configured(p),connected:!!data?.token&&(!data.expiresAt||data.expiresAt>Date.now()),account:data?.account||'',destination:data?.destination||null};}
 return json(result);
}
export async function connect(request:Request,p:Provider){
 if(request.headers.get('origin')!==APP_ORIGIN)return json({error:'Start this connection from SpecFlow.'},403);
 const user=await authenticatedUser(request),creds=credentials(p),db=firestore()!,state=randomToken(),browser=randomToken(),verifier=randomToken();
 await db.collection('specflow_oauth_states').doc(await hashToken(state)).set({uid:user.uid,provider:p,browser:await hashToken(browser),verifier:await seal(verifier,secret()),expiresAt:Date.now()+600000});
 const url=new URL(p==='github'?'https://github.com/login/oauth/authorize':'https://slack.com/oauth/v2/authorize');
 url.searchParams.set('client_id',creds.id);url.searchParams.set('redirect_uri',callback(p));url.searchParams.set('state',state);
 if(p==='github'){url.searchParams.set('scope','repo read:user');url.searchParams.set('code_challenge',await hashToken(verifier));url.searchParams.set('code_challenge_method','S256');}
 else url.searchParams.set('scope','channels:read,groups:read,chat:write');
 return json({authorizationUrl:url.toString()},200,{'Set-Cookie':cookie(p,browser)});
}
export async function oauthCallback(request:Request,p:Provider){
 try{
  const url=new URL(request.url),state=url.searchParams.get('state'),code=url.searchParams.get('code'),browser=cookieValue(request,p),db=firestore();
  if(url.searchParams.has('error')||!state||state.length>200||!code||code.length>6000||!browser||!db)throw Error('Invalid authorization.');
  const stateRef=db.collection('specflow_oauth_states').doc(await hashToken(state)),browserHash=await hashToken(browser);
  const saved=await db.runTransaction(async tx=>{const doc=await tx.get(stateRef),row=doc.data();if(!row||row.provider!==p||row.expiresAt<Date.now()||row.browser!==browserHash)throw Error('Authorization expired.');tx.delete(stateRef);return row;});
  const creds=credentials(p),params=new URLSearchParams({client_id:creds.id,client_secret:creds.key,code,redirect_uri:callback(p)});
  if(p==='github')params.set('code_verifier',await unseal(saved.verifier,secret()));
  const response=await fetch(p==='github'?'https://github.com/login/oauth/access_token':'https://slack.com/api/oauth.v2.access',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok||data.error||data.ok===false||typeof data.access_token!=='string')throw Error('Authorization failed.');
  let account='';
  if(p==='github'){const who=await github(data.access_token,'/user');if(typeof who.login!=='string')throw Error('Account could not be verified.');account=who.login;}
  else account=String(data.team?.name||'Slack workspace');
  await owner(saved.uid,p).set({token:await seal(data.access_token,secret()),account,teamId:data.team?.id||null,expiresAt:data.expires_in?Date.now()+Number(data.expires_in)*1000:null,connectedAt:new Date().toISOString(),destination:null});
  return new Response(null,{status:303,headers:{Location:`${APP_ORIGIN}/connections?connected=${p}`,'Set-Cookie':cookie(p,'',0),'Cache-Control':'no-store'}});
 }catch{return new Response(null,{status:303,headers:{Location:`${APP_ORIGIN}/connections?connection=failed`,'Set-Cookie':cookie(p,'',0),'Cache-Control':'no-store'}});}
}
async function token(uid:string,p:Provider){const row=(await owner(uid,p).get()).data();if(!row?.token||(row.expiresAt&&row.expiresAt<Date.now()))throw Error(`Reconnect ${p} to continue.`);return{value:await unseal(row.token,secret()),row};}
export async function github(access:string,path:string,options:RequestInit={}){
 const r=await fetch(`https://api.github.com${path}`,{...options,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${access}`,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error(`GitHub request failed (${r.status}). Check repository access.`);return r.json();
}
async function choices(uid:string,p:Provider):Promise<Destination[]>{
 const access=await token(uid,p);
 if(p==='github'){const rows=await github(access.value,'/user/repos?per_page=100&sort=updated');if(!Array.isArray(rows))throw Error('Repository list is unavailable.');return rows.filter(r=>r.has_issues&&!r.archived&&r.permissions?.push).map(r=>({id:r.full_name,label:r.full_name,url:r.html_url}));}
 const r=await fetch('https://slack.com/api/conversations.list?limit=200&types=public_channel,private_channel&exclude_archived=true',{headers:{Authorization:`Bearer ${access.value}`},signal:AbortSignal.timeout(15000)}),data=await r.json();
 if(!r.ok||!data.ok)throw Error('Slack channel list is unavailable. Check workspace permissions.');
 return (data.channels||[]).filter((c:{is_member?:boolean})=>c.is_member).map((c:{id:string;name:string})=>({id:c.id,label:`#${c.name}`,url:`https://app.slack.com/client/${access.row.teamId}/${c.id}`}));
}
export async function destinations(request:Request,p:Provider){const user=await authenticatedUser(request);return json({destinations:await choices(user.uid,p),note:p==='github'?'Up to 100 recently updated writable repositories with issues enabled.':'Channels the bot has joined, from the first 200 accessible channels. Invite the app to a channel if it is missing.'});}
export async function selectDestination(request:Request,p:Provider){
 const user=await authenticatedUser(request),raw=await request.text();if(raw.length>500)throw Error('Request too large.');const input=JSON.parse(raw);
 const selected=(await choices(user.uid,p)).find(d=>d.id===input.id);if(!selected)throw Error('Select an accessible destination from the list.');await owner(user.uid,p).update({destination:selected});return json({destination:selected});
}
export async function disconnect(request:Request,p:Provider){const user=await authenticatedUser(request);await owner(user.uid,p).delete();return json({disconnected:true});}
export async function connectionForDelivery(uid:string,p:Provider){const access=await token(uid,p);if(!access.row.destination)throw Error(`Choose a ${p} destination in Connections first.`);return{access:access.value,destination:access.row.destination as Destination};}
export async function assignees(request:Request){const user=await authenticatedUser(request),connection=await connectionForDelivery(user.uid,'github');if(!/^[\w.-]+\/[\w.-]+$/.test(connection.destination.id))throw Error('Invalid repository.');const users=await github(connection.access,`/repos/${connection.destination.id}/assignees?per_page=100`);return json({assignees:(users as {login:string}[]).map(u=>u.login)});}
