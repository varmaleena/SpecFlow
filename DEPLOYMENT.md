# Vercel + Firebase deployment

The root application is Next.js with server API routes. Render is not required. The ignored `hosted/` checkout is the earlier Cloudflare preview; its storage and secrets are independent.

## Firebase project: specflow-b2b77

1. In Firebase Console, create a Cloud Firestore database if absent. This uses Firestore, not Realtime Database.
2. Enable Authentication → Google sign-in and set the support email. Add your production Vercel hostname under Authentication → Settings → Authorized domains. Add localhost for local sign-in testing.
3. Register a Web app under Project settings → General. Copy apiKey, authDomain, projectId and appId into the matching NEXT_PUBLIC_FIREBASE_* Vercel environment variables. These are public identifiers, not a server credential.
4. Configure the server service account through Vercel's private environment settings: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY. Keep the private key out of Git and chat. The key may contain actual newlines or escaped backslash-n sequences.
5. Deploy firestore.rules to this project, or copy them into the Firestore rules editor. They deny browser database access; all operations use server routes with Firebase ID-token verification and owner-scoped project paths. Firebase Admin bypasses rules, so the server ownership checks are essential.

## Vercel

1. Import this GitHub repository, select Next.js and use the repository root. Use Node.js 22. npm ci installs the lockfile.
2. Add the variables from .env.example. Set APP_URL to the canonical HTTPS production origin, with no trailing slash. Initially leave it empty if the final domain is not known; the runtime can use VERCEL_PROJECT_PRODUCTION_URL. After assigning the production URL, set APP_URL and redeploy.
3. Add GEMINI_API_KEY or GROQ_API_KEY as server secrets. These authorize the AI provider, independently of Vercel and Firebase. Do not use NEXT_PUBLIC_ for them. The default provider is Gemini; visitors can select Groq in Settings if configured.
4. Generate a 32-byte base64url FLOW_TOKEN_ENCRYPTION_KEY in a password manager or secure local tool and add it as a server secret. Keep it stable across deploys, or existing Wispr connections cannot be decrypted.
5. Deploy. Vercel environment changes need a redeployment, especially NEXT_PUBLIC_* values, which are embedded at build time.

## What persists

Firebase stores account-owned project snapshots, AI usage caps, encrypted Wispr sessions and delivery receipts. Each save-as-new operation creates a project; updating an existing project uses its revision to prevent accidental overwrites across tabs. Opening a project resets review approval. Kanban edits remain local until the user explicitly saves. Sign-out leaves browser-local drafts on that device; it removes account access.

The finite Firebase storage adapter translates only the quota, connection and delivery operations used by this app. It does not provide arbitrary SQL. Transactions protect quota reservations, OAuth state consumption and duplicate-send claims. Expired usage/session records are cleaned in bounded batches. Firestore usage and provider quotas still apply.

## Verification before submission

- npm test; npm run build.
- Google sign-in from the production domain.
- Save a project, reopen it on another device and verify a different account cannot read it.
- Generate a plan with a configured AI provider and confirm its engine label. Current provider errors must remain visible as local fallback.
- Connect Wispr and read a non-confidential meeting. Its OAuth metadata uses APP_URL, so the deployment must be publicly reachable.
- Configure an incoming webhook through Settings and explicitly confirm a test delivery to an authorized Slack channel. A Slack access token is not a webhook URL; token-based Slack posting is not implemented.

No secrets or data from the Cloudflare preview are automatically transferred. Firebase live operations cannot be verified until its server credentials and web app configuration are set.
