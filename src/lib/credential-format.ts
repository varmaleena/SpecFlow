/** Accept PEM values pasted with real newlines or JSON-escaped newlines. */
export function normalizePrivateKey(value: string | undefined): string | undefined {
  return value?.replace(/\\n/g, '\n');
}
