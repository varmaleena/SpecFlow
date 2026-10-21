import { env, APP_ORIGIN } from './server-runtime';
export { APP_ORIGIN } from './server-runtime';
import { hashToken, randomToken, seal, unseal } from './wispr-crypto';


const MCP_URL = 'https://api.wisprflow.ai/connect/mcp';
const AUTH_ISSUER = 'https://mcp-auth.wisprflow.com';
const CLIENT_URL = `${APP_ORIGIN}/api/wispr/client`;
const CALLBACK = `${APP_ORIGIN}/api/wispr/callback`;
const COOKIE = '__Host-specflow-wispr';
const privateHeaders = { 'Cache-Control': 'private, no-store' };
type Stored = { session_hash: string; state_hash: string | null; verifier_sealed: string | null; tokens_sealed: string | null; token_expires: number; expires_at: number };
type Tokens = { access_token: string; refresh_token?: string; expires_in?: number };
type Tool = { name: string; inputSchema?: { properties?: Record<string, { type?: string; format?: string; enum?: string[] }>; required?: string[] } };
type RpcResult = { tools?: Tool[]; protocolVersion?: string; content?: { type: string; text?: string }[]; structuredContent?: unknown; isError?: boolean };

function response(body: unknown, status = 200, headers: Record<string, string> = {}) { return Response.json(body, { status, headers: { ...privateHeaders, ...headers } }); }
function cookie(value: string, age = 2592000) { return `${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${age}`; }
function session(request: Request) { const value = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1); return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null; }
function configuration() { if (!env.DB || !env.FLOW_TOKEN_ENCRYPTION_KEY) throw Error('Notetaker connections are not enabled on this deployment. You can still paste notes.'); return { db: env.DB, secret: env.FLOW_TOKEN_ENCRYPTION_KEY }; }
function sameOrigin(request: Request) { if (request.headers.get('origin') !== APP_ORIGIN) throw Error('Please start this action from SpecFlow.'); }
async function current(request: Request) { const id = session(request); if (!id || !env.DB) return null; return env.DB.prepare('SELECT * FROM wispr_connections WHERE session_hash = ? AND expires_at > ?').bind(await hashToken(id), Math.floor(Date.now() / 1000)).first<Stored>(); }
async function metadata() {
  const r = await fetch(`${AUTH_ISSUER}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw Error('Wispr sign-in is temporarily unavailable.');
  const data = await r.json() as { issuer?: string; authorization_endpoint?: string; token_endpoint?: string; client_id_metadata_document_supported?: boolean; code_challenge_methods_supported?: string[] };
  if (data.issuer !== AUTH_ISSUER || !data.client_id_metadata_document_supported || !data.code_challenge_methods_supported?.includes('S256') || data.authorization_endpoint !== `${AUTH_ISSUER}/oauth2/authorize` || data.token_endpoint !== `${AUTH_ISSUER}/oauth2/token`) throw Error('Wispr authorization settings changed. Use pasted notes while this connection is reviewed.');
  return data as { authorization_endpoint: string; token_endpoint: string };
}
async function exchange(params: URLSearchParams): Promise<Tokens> {
  const discovery = await metadata();
  const r = await fetch(discovery.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error('Wispr authorization could not complete. Reconnect and review the access request.');
  const tokens = await r.json() as Tokens;
  if (typeof tokens.access_token !== 'string' || !tokens.access_token || tokens.access_token.length > 20000 || (tokens.refresh_token && tokens.refresh_token.length > 20000)) throw Error('Wispr returned an unsupported authorization response.');
  return tokens;
}
async function tokenFor(request: Request) {
  const { db, secret } = configuration(), row = await current(request);
  if (!row?.tokens_sealed) throw Error('Connect your Wispr Flow account to read meeting notes.');
  let tokens = JSON.parse(await unseal(row.tokens_sealed, secret)) as Tokens;
  if (row.token_expires < Math.floor(Date.now() / 1000) + 60) {
    if (!tokens.refresh_token) throw Error('Your Wispr connection expired. Please reconnect.');
    const refreshed = await exchange(new URLSearchParams({ grant_type: 'refresh_token', client_id: CLIENT_URL, refresh_token: tokens.refresh_token, resource: MCP_URL }));
    tokens = { ...refreshed, refresh_token: refreshed.refresh_token || tokens.refresh_token };
    await db.prepare('UPDATE wispr_connections SET tokens_sealed = ?, token_expires = ? WHERE session_hash = ?').bind(await seal(JSON.stringify(tokens), secret), Math.floor(Date.now() / 1000) + Math.min(86400, Math.max(60, tokens.expires_in || 3600)), row.session_hash).run();
  }
  return tokens.access_token;
}
async function rpcResponse(r: Response, id: number): Promise<RpcResult> {
  if (r.status === 401 || r.status === 403) throw Error('Wispr access was denied or expired. Check Notetaker/MCP access in Flow and reconnect.');
  if (!r.ok || !r.body) throw Error('Wispr could not read these notes right now. Try again shortly.');
  const reader = r.body.getReader(), decoder = new TextDecoder(), sse = r.headers.get('content-type')?.includes('text/event-stream');
  let text = '', bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) { bytes += value.length; if (bytes > 1000000) throw Error('This meeting response is too large. Use a shorter note or excerpt.'); text += decoder.decode(value, { stream: true }); }
      if (sse) {
        const blocks = text.replace(/\r\n/g, '\n').split('\n\n'); text = blocks.pop() || '';
        for (const block of blocks) {
          const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data || data === '[DONE]') continue;
          const packet = JSON.parse(data) as { id?: number; result?: RpcResult; error?: unknown };
          if (packet.id === id) { if (packet.error || !packet.result || packet.result.isError) throw Error('Wispr could not complete this read. Check your access and try a narrower query.'); return packet.result; }
        }
      }
      if (done) break;
    }
    const packet = JSON.parse(text) as { id?: number; result?: RpcResult; error?: unknown };
    if (packet.id !== id || packet.error || !packet.result || packet.result.isError) throw Error('Wispr could not complete this read.');
    return packet.result;
  } finally { await reader.cancel().catch(() => {}); }
}
async function mcp(request: Request) {
  const accessToken = await tokenFor(request);
  const initialHeaders: Record<string, string> = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const initialized = await fetch(MCP_URL, { method: 'POST', headers: initialHeaders, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'SpecFlow', version: '2.0.0' } } }), signal: AbortSignal.timeout(20000) });
  const sessionId = initialized.headers.get('mcp-session-id');
  const info = await rpcResponse(initialized, 1);
  const headers = { ...initialHeaders, 'MCP-Protocol-Version': info.protocolVersion || '2025-03-26', ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) };
  await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), signal: AbortSignal.timeout(10000) }).then(r => r.body?.cancel()).catch(() => {});
  let nextId = 2;
  return async (method: 'tools/list' | 'tools/call', params: unknown = {}) => {
    const id = nextId++;
    const r = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(20000) });
    return rpcResponse(r, id);
  };
}
function argsFor(tool: Tool, values: Record<string, string | number | boolean>) {
  const properties = tool.inputSchema?.properties || {};
  const args = Object.fromEntries(Object.entries(values).filter(([key]) => key in properties));
  const unsupported = (tool.inputSchema?.required || []).filter(k => !(k in args));
  if (unsupported.length) throw Error('This version of Wispr needs additional search options. Paste a meeting excerpt to continue.');
  return args;
}
function payload(result: RpcResult): unknown {
  if (result.structuredContent != null) return result.structuredContent;
  const value = (result.content || []).filter(c => c.type === 'text').map(c => c.text || '').join('\n');
  try { return JSON.parse(value); } catch { return value; }
}
function meetingCards(value: unknown) {
  const found: { id: string; title: string; date: string }[] = [], seen = new Set<string>();
  function visit(item: unknown, depth = 0) {
    if (depth > 5 || found.length >= 12 || !item) return;
    if (Array.isArray(item)) { item.slice(0, 30).forEach(v => visit(v, depth + 1)); return; }
    if (typeof item !== 'object') return;
    const row = item as Record<string, unknown>, id = row.meeting_id || row.id, title = row.title || row.meeting_title || row.name;
    if (typeof id === 'string' && id.length <= 200 && typeof title === 'string' && !seen.has(id)) { seen.add(id); found.push({ id, title: title.slice(0, 200), date: String(row.start_time || row.started_at || row.created_at || row.date || '').slice(0, 50) }); return; }
    Object.values(row).forEach(v => visit(v, depth + 1));
  }
  visit(value); return found;
}
function plainNotes(value: unknown) {
  if (typeof value === 'string') return value;
  const lines: string[] = [];
  function visit(item: unknown, prefix = '', depth = 0) {
    if (depth > 6 || lines.join('\n').length > 30000 || item == null) return;
    if (typeof item === 'string') { if (item.trim()) lines.push(prefix ? `${prefix}: ${item}` : item); return; }
    if (Array.isArray(item)) { item.slice(0, 100).forEach(v => visit(v, prefix, depth + 1)); return; }
    if (typeof item === 'object') Object.entries(item).filter(([k]) => !/token|secret|email|audio_url/i.test(k)).forEach(([k, v]) => visit(v, k.replace(/_/g, ' '), depth + 1));
  }
  visit(value); return lines.join('\n');
}
export async function wisprGet(request: Request, action: string) {
  if (action === 'client') return Response.json({ client_id: CLIENT_URL, client_name: 'SpecFlow', client_uri: APP_ORIGIN, redirect_uris: [CALLBACK], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'openid offline_access' }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  if (action === 'status') { const row = await current(request); return response({ available: !!env.DB && !!env.FLOW_TOKEN_ENCRYPTION_KEY, connected: !!row?.tokens_sealed }); }
  if (action !== 'callback') return response({ error: 'Not found.' }, 404);
  try {
    const { db, secret } = configuration(), url = new URL(request.url);
    if (url.searchParams.get('error')) throw Error('Wispr access was not granted.');
    const code = url.searchParams.get('code'), state = url.searchParams.get('state'), row = await current(request);
    if (!code || code.length > 6000 || !state || !row?.state_hash || !row.verifier_sealed || row.state_hash !== await hashToken(state) || row.token_expires < Math.floor(Date.now() / 1000)) throw Error('Wispr sign-in expired or could not be verified.');
    const consumed = await db.prepare('UPDATE wispr_connections SET state_hash = NULL WHERE session_hash = ? AND state_hash = ?').bind(row.session_hash, row.state_hash).run();
    if (consumed.meta.changes !== 1) throw Error('This sign-in has already been used.');
    const tokens = await exchange(new URLSearchParams({ grant_type: 'authorization_code', code, client_id: CLIENT_URL, redirect_uri: CALLBACK, code_verifier: await unseal(row.verifier_sealed, secret), resource: MCP_URL }));
    await db.prepare('UPDATE wispr_connections SET tokens_sealed = ?, verifier_sealed = NULL, token_expires = ?, expires_at = ? WHERE session_hash = ?').bind(await seal(JSON.stringify(tokens), secret), Math.floor(Date.now() / 1000) + Math.min(86400, Math.max(60, tokens.expires_in || 3600)), Math.floor(Date.now() / 1000) + 2592000, row.session_hash).run();
    return Response.redirect(`${APP_ORIGIN}/workspace?wispr=connected`, 303);
  } catch { return Response.redirect(`${APP_ORIGIN}/workspace?wispr=failed`, 303); }
}
export async function wisprPost(request: Request, action: string) {
  try {
    sameOrigin(request);
    const { db, secret } = configuration();
    if (action === 'connect') {
      const discovery = await metadata(), id = randomToken(), state = randomToken(), verifier = randomToken(), now = Math.floor(Date.now() / 1000);
      const previous = session(request); if (previous) await db.prepare('DELETE FROM wispr_connections WHERE session_hash = ?').bind(await hashToken(previous)).run();
      await db.prepare('DELETE FROM wispr_connections WHERE expires_at < ?').bind(now).run();
      await db.prepare('INSERT INTO wispr_connections (session_hash, state_hash, verifier_sealed, token_expires, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await hashToken(id), await hashToken(state), await seal(verifier, secret), now + 600, now + 600).run();
      const url = new URL(discovery.authorization_endpoint);
      url.search = new URLSearchParams({ client_id: CLIENT_URL, redirect_uri: CALLBACK, response_type: 'code', scope: 'openid offline_access', resource: MCP_URL, state, code_challenge: await hashToken(verifier), code_challenge_method: 'S256' }).toString();
      return response({ authorizationUrl: url.toString() }, 200, { 'Set-Cookie': cookie(id) });
    }
    if (action === 'disconnect') { const id = session(request); if (id) await db.prepare('DELETE FROM wispr_connections WHERE session_hash = ?').bind(await hashToken(id)).run(); return response({ disconnected: true }, 200, { 'Set-Cookie': cookie('', 0) }); }
    if (!['search', 'meeting'].includes(action)) return response({ error: 'Not found.' }, 404);
    const raw = await request.text(); if (raw.length > 3000) throw Error('Search request too large.');
    const input = JSON.parse(raw) as { query?: unknown; id?: unknown };
    const call = await mcp(request), tools = (await call('tools/list')).tools || [];
    if (action === 'search') {
      if (typeof input.query !== 'string' || input.query.trim().length < 2 || input.query.length > 200) throw Error('Enter at least two characters from the meeting title or topic.');
      const tool = tools.find(t => t.name === 'search_meetings'); if (!tool) throw Error('Meeting search is not available on this Wispr connection. You can paste notes instead.');
      const result = payload(await call('tools/call', { name: tool.name, arguments: argsFor(tool, { query: input.query.trim(), search_query: input.query.trim(), q: input.query.trim(), limit: 8, max_results: 8, page_size: 8 }) }));
      return response({ meetings: meetingCards(result), excerpt: plainNotes(result).slice(0, 5000) });
    }
    if (typeof input.id !== 'string' || !input.id || input.id.length > 200) throw Error('Select a meeting from your search results.');
    const tool = tools.find(t => t.name === 'get_meeting'); if (!tool) throw Error('Meeting details are not available on this Wispr connection.');
    const result = payload(await call('tools/call', { name: tool.name, arguments: argsFor(tool, { meeting_id: input.id, id: input.id, include_transcript: true }) }));
    const text = plainNotes(result);
    return response({ text: text.slice(0, 4500), truncated: text.length > 4500 });
  } catch (error) { return response({ error: error instanceof SyntaxError ? 'Invalid request.' : error instanceof Error ? error.message : 'The Wispr request could not complete.' }, 400); }
}
