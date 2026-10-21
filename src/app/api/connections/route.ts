import { connectionStatus } from '@/lib/connections';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{return await connectionStatus(request);}catch{return Response.json({error:'Sign in with a configured Firebase account to manage connections.'},{status:401,headers:{'Cache-Control':'no-store'}});}}
