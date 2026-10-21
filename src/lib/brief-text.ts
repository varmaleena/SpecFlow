export function splitIntoSentences(text: string, keepPunctuation = false): string[] {
  const protectedText = text
    .replace(/\b(Next|Node|React|Vue|Nuxt|Nest|Express|Three|Mermaid|Chart|Auth|Prisma|Supabase|FastAPI)\.js\b/gi, '$1__DOT__js')
    .replace(/\.(ts|tsx|js|jsx|py|json|md|sql|env|io|ai|com|in)\b/gi, '__DOT__$1')
    .replace(/\b(v\d+)\.(\d+)/gi, '$1__DOT__$2')
    .replace(/(\d)\.(\d)/g, '$1__DOT__$2');
  return protectedText.split(/(?<=[.!?])\s+|[;\n]+/).map(s => { const restored = s.replace(/__DOT__/g, '.').trim(); return keepPunctuation ? restored : restored.replace(/[.!?]+$/, ''); }).filter(Boolean);
}
export type Owner = { name: string; scope: string };
export function extractOwners(sentences: string[]): Owner[] {
  const result: Owner[] = [];
  for (const sentence of sentences) {
    // Split only assignment clauses, never a conjunction inside the task scope.
    const clauses = sentence.replace(/\b(to|for)\s+([\p{L}'-]+)\s+and\s+/giu, '$1 $2, ').split(/,(?!\d)\s*(?:and\s+)?|\s+and\s+(?=[\p{L}'-]+\s+(?:owns|handles|leads|takes|builds)\b)/iu);
    let assigning = /^assign\b/i.test(sentence);
    for (const clause of clauses) {
      const owned = clause.match(/^([\p{L}'-]+)\s+(?:owns|handles|leads|takes|builds|is responsible for)\s+(?:the\s+)?(.+)$/iu);
      const assigned = assigning ? clause.match(/^(?:assign\s+)?(?:the\s+)?(.+?)\s+(?:to|for)\s+([\p{L}'-]+)$/iu) : null;
      const passive = clause.match(/^(.+?)\s+(?:owned|handled) by\s+([\p{L}'-]+)$/iu);
      const owner = owned ? { name: owned[1], scope: owned[2] } : assigned || passive ? { name: (assigned || passive)![2], scope: (assigned || passive)![1] } : null;
      if (owner && !result.some(o => o.name === owner.name && o.scope === owner.scope)) result.push(owner);
    }
  }
  return result;
}
export const isAssignment = (s: string) => /^assign\b|\b(?:owns|handles|leads|is responsible for|owned by|handled by)\b/i.test(s);
export const isGuardrail = (s: string) => /make sure|guard against|mask|pii|credit card|idempotenc|encrypt|soc\s?2|gdpr|audit|never double|duplicate/i.test(s);
export function toComponentLabel(raw: string): string {
  const clean = raw.replace(/[\"<>\[\]{}|`\\]/g, '').trim();
  if (/^(?:check|verify|validate)\b/i.test(clean)) return (clean.replace(/^(?:check|verify|validate)\s+(?:the\s+)?/i, '') + ' Verification').slice(0,36);
  if (/^(?:approve|reject)\b/i.test(clean)) return (clean.replace(/^(?:approve|reject)\s+(?:the\s+)?/i, '') + ' Review Service').slice(0,36);
  return raw.replace(/^(?:we need to |please )?(?:build|create|design|make)\s+(?:an?\s+)?/i, '')
    .replace(/^(?:whenever|when)\s+(?:a\s+)?/i, '').replace(/^(?:trigger|send|pause|check|query|fetch)\s+(?:an?\s+|the\s+)?/i, '')
    .replace(/["<>\[\]{}|`\\]/g, '').replace(/[\r\n]/g, ' ').trim().slice(0, 36);
}
