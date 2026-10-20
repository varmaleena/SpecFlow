# SpecFlow

A Wispr Flow-powered planning workspace: Brief → Architecture → Specification → Sprint → Deliver.

Dictate a brief using the installed Flow app, review its artifacts, refine specifications and tickets in editable fields, and approve the current version before delivery. The website receives text from Flow; it does not record audio. Dictionary, Snippets and eligible Command Mode are configured in Flow itself.

## Run

Use Node.js 22. Run npm ci, copy .env.example to .env.local and fill only the values you use, then npm run dev. Open http://localhost:3000. npm test runs the automated checks; npm run build creates the production application.

## Deployment

The root application targets Vercel with Firebase Authentication and Cloud Firestore. Next.js API routes provide the backend; Render is not required. See DEPLOYMENT.md for exact configuration. Firebase project: specflow-b2b77. Server secrets belong in private Vercel environment settings. NEXT_PUBLIC_FIREBASE_* values are public Firebase web-app identifiers.

The old Sites/Cloudflare preview remains in a separate ignored hosted/ checkout and is not the Vercel source. Its secrets and database are not transferred automatically.

## Features

- Guest/browser-local planning plus optional Google sign-in, explicit account saves and a My projects view when Firebase is configured.
- Domain-independent local requirements maps with source conditions and explicit dependencies. Complex or unspecified outcomes remain review questions. The exact bundled invoice demo retains its sample preset; arbitrary invoice briefs do not inherit that preset's rules.
- Optional Gemini 3.1 Flash-Lite or Groq generation, validated structured output, shared quota limits and visible fallback. Supported local edits use zero AI calls; unsupported edits preserve the existing plan during provider failures.
- Versioned edits, source evidence, change receipts, review gates and explicit version-bound delivery confirmation.
- Wispr Notetaker read-only MCP OAuth/PKCE; selected meeting imports require account authorization. OAuth credentials are encrypted server-side.
- Slack/Discord incoming-webhook delivery with durable duplicate protection. A Slack access token is not a webhook URL. GitHub exports open prefilled drafts for manual submission; email remains a copyable draft.

Saved projects use server-verified Firebase identity and owner-scoped records. Opening a saved project resets review approval. Kanban changes are local until explicitly saved. Shared editing, Jira synchronization, calendar and scratchpad tools are not implemented.

## Verification limits

Automated tests cover planning, edits, budgets, delivery receipts, encryption and the Firebase storage adapter. Browser checks previously verified the Cloudflare preview across four domains. Live Firebase sign-in, cross-account isolation and Vercel runtime behavior require the project's configured credentials and production domain; do not describe those as verified until performed. Authenticated Wispr reads and real Slack delivery require the user's authorized test connections.

See SUBMISSION_DEMO.md for a demonstration outline and UPGRADE_PLAN.md for the remaining integration roadmap.
