'use client';
import { useEffect, useState } from 'react';
export default function EngineStatus() {
  const [ready, setReady] = useState(false);
  useEffect(() => { fetch('/api/engine-status').then(r => r.json()).then(data => setReady((data as { configured?: boolean }).configured === true)).catch(() => {}); }, []);
  return <span className="local-status" title={ready ? 'Gemini 3.1 Flash-Lite · shared AI capped at 30 requests/day and 3/minute. Supported voice edits run locally.' : 'Smart Local NLP works without an API key.'}><i className="dot green"/>{ready ? 'Gemini Lite · quota protected' : 'Zero-key engine ready'}</span>;
}
