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
- Connect GitHub and Slack from Connections, select an authorized test repository/channel, and explicitly confirm a test action. Verify its actual issue/message link and duplicate protection.

No secrets or data from the Cloudflare preview are automatically transferred. Firebase live operations cannot be verified until its server credentials and web app configuration are set.

## Account connections (one-time application setup)

Register a GitHub OAuth app and a Slack app owned by you. Visitors authorize their own accounts; they do not paste tokens or webhook URLs into the planning flow.

Set server-only GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SLACK_CLIENT_ID and SLACK_CLIENT_SECRET in Vercel. Set CONNECTOR_TOKEN_ENCRYPTION_KEY to a stable 32-byte base64url secret (or reuse the existing FLOW_TOKEN_ENCRYPTION_KEY). Never use NEXT_PUBLIC_ for these secrets.

Callbacks:
- https://YOUR_DOMAIN/api/connections/github/callback
- https://YOUR_DOMAIN/api/connections/slack/callback

GitHub OAuth requests repo and read:user; the provider consent screen shows that scope. An OAuth app's repo scope is broad; a fine-grained GitHub App installation is a future improvement. SpecFlow's UI restricts publishing to the selected writable repository. If expiring tokens are enabled, this version requires reconnection after expiry; automatic refresh is not implemented.

Slack bot scopes are channels:read, groups:read and chat:write. Install the app and invite it to the intended test channel. Only channels the bot has joined are offered, from the initial accessible channel page. Token rotation currently requires reconnection when the token expires.

Connect in /connections, choose a default repository/channel, then review and confirm actions in /workspace. GitHub assignees come from the selected repository; unmatched draft names are left unassigned until explicitly mapped. Up to ten issues are created per confirmation; every issue has a durable operation receipt. Partial/uncertain results remain visible and are not automatically replayed. For multiple projects, check the current default destination before each delivery.

OAuth state is single-use, time-limited and bound to a browser cookie and Firebase identity. Access tokens are encrypted at rest and never returned to the browser. Disconnect removes SpecFlow's stored credential; revoke the provider authorization from GitHub/Slack to remove the app's remote grant as well.

The public homepage, /login, /projects, /connections and /workspace are separate routes. Wispr authorization returns to /workspace. OAuth setup and a live authenticated test remain necessary before claiming connected delivery works in production.
