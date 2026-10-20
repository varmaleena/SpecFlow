const encoder = new TextEncoder();
export function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function decode(value: string) { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
export function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
export async function hashToken(value: string) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
async function key(secret: string) { const bytes = decode(secret); if (bytes.length !== 32) throw Error('Invalid encryption configuration.'); return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function seal(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('specflow-wispr-v1') }, await key(secret), encoder.encode(value));
  return `${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`;
}
export async function unseal(value: string, secret: string) {
  const [iv, data] = value.split('.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(iv), additionalData: encoder.encode('specflow-wispr-v1') }, await key(secret), decode(data));
  return new TextDecoder().decode(decrypted);
}
