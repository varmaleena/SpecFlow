import type { Firestore } from 'firebase-admin/firestore';
import { hashToken } from './wispr-crypto';
export type PublishReceipt={id:string;state:'sent'|'failed'|'unknown'|'pending';url?:string;externalId?:string;duplicate?:boolean};
// Claim before the external request. A timeout stays unknown and cannot replay.
export async function once(db:Firestore,key:string,operation:()=>Promise<{url?:string;externalId:string}>,metadata:Record<string,string|number>={}):Promise<PublishReceipt>{
 const id=await hashToken(key),ref=db.collection('specflow_publish_receipts').doc(id);
 const previous=await db.runTransaction(async tx=>{const doc=await tx.get(ref),row=doc.data();if(row&&row.state!=='failed')return row;tx.set(ref,{...metadata,state:'pending',createdAt:new Date().toISOString()});return null;});
 if(previous)return{id,state:previous.state,url:previous.url,externalId:previous.externalId,duplicate:true};
 try{const result=await operation();await ref.set({...metadata,state:'sent',...result,completedAt:new Date().toISOString()});return{id,state:'sent',...result};}
 catch(error){const state=error instanceof RejectedRequest?'failed':'unknown';await ref.set({...metadata,state,completedAt:new Date().toISOString()}).catch(()=>{});return{id,state};}
}
export class RejectedRequest extends Error{}
