# SpecFlow: from demo to company workflow

## Product focus

Help an engineering lead turn a spoken decision into a reviewed change across Jira and Slack. Company context, accurate identity mapping, source citations, change previews and verified delivery are the core value. A diagram and four generated panels alone are not enough differentiation.

The current release generates drafts, applies supported local voice changes, keeps browser-local history, and provides a local Kanban. GitHub export opens drafts. Slack delivery requires a webhook. It does not currently import a company directory, synchronize Jira, import meeting recordings, or support shared projects. The hosted database stores quota counters, encrypted per-session Wispr connections and delivery receipts, not company directories or shared projects.

## One complete workflow to build next

1. An admin connects one Jira project and one Slack workspace, choosing permitted channels and permissions.
2. SpecFlow reads project issue types, workflow states, required fields, assignable members and existing issues. It records stable external IDs, not only display names.
3. The user dictates a feature request and optionally selects a meeting transcript or policy document as context.
4. SpecFlow retrieves only relevant, permitted context and displays source links. Duplicate or conflicting work is highlighted.
5. It proposes explicit actions: create three tickets, update one existing issue, and send a summary to a selected Slack channel. Ambiguous assignees require clarification.
6. The user reviews the diff and approves that version. Changes to the plan invalidate the approval.
7. A durable execution job performs approved actions, using an idempotency key for each operation. It records returned Jira IDs and Slack message links, retries recoverable failures, and exposes partial failures.
8. Jira webhooks reconcile status changes into the planning view. Jira remains the authoritative task system.

## Connection architecture

| Integration | Connection | Required application work |
| --- | --- | --- |
| Slack | OAuth installation per company | OAuth callback and state protection, minimum scopes, encrypted refreshable credentials, channel selection, verified interactions and real message receipts |
| Jira | Official API or authenticated remote MCP | Project permissions, issue schema discovery, member mapping, create/update operations, webhook verification, reconciliation and retry-safe execution |
| Employee directory | Workspace directory, approved IdP, or initially Jira's assignable members | Stable identity mapping; use name, work identity, team and assignment eligibility only; clarify duplicate names |
| Company MCP | Admin-selected HTTPS endpoint and its supported authentication | Discover server capabilities and approved tools, validate authorization/resource scopes, separate read and write permissions, and enforce user/workspace access |
| Gmail / Outlook | User or organization OAuth connection | Separate email authorization, selected threads/folders, permission review, source links, approved drafts/sends; a Gemini key cannot authorize mailbox access |
| Private network tools | Company-approved relay or private connectivity | Company network access, endpoint restrictions and authenticated request handling; a public website cannot directly reach an arbitrary employee's localhost |

MCP provides a tool interface. It does not automatically grant company permissions, turn every data source into a usable tool, or resolve user identities across products.

## Priorities

1. **Real Jira + Slack execution:** ship one end-to-end workflow and return actual external object links. Keep the demo available without integrations.
2. **Workspace identity and data:** signed-in users, tenant-scoped records and roles, server-side authorization, encrypted connector tokens, revocation, deletion and audit events. Public access to the landing page does not imply access to company records.
3. **Context and identity:** retrieve relevant policies/issues with source citations; map assignees to real external user IDs; detect existing work and ask on ambiguity.
4. **Voice change control:** preview before/after differences across all affected artifacts. Voice drafting may auto-run; external publication needs an explicit separate approval tied to the reviewed plan.
5. **Execution reliability:** durable jobs, idempotency, bounded retries, dead-letter recovery, webhook reconciliation, operation logs and visible partial success.
6. **Measured product quality:** test previously unseen briefs and voice edits, measure correction rate and completion time, and compare the complete workflow with using existing Jira/Linear/Notion tools directly.

## AI and quota policy

Use Gemini 3.1 Flash-Lite for a compact structured generation request. Supported local edits use zero AI calls. No automatic retries or fallback to larger paid models. Validate output before accepting it. Protect the shared hosted key with durable limits of 30 reserved requests per UTC day and 3 per minute. A provider 429 opens a five-minute cooldown. These application limits do not determine or expand Google's project quota. Personal API keys use their own provider quota.

Keep the hosted key in server secret storage, never source or browser bundles. Personal credentials entered in Settings remain in session memory. The local engine remains available during provider, quota or budget-store failures.

## Competitive position

Linear already supports planning-to-issues workflows over MCP. Notion provides connected knowledge search and selected actions. Microsoft provides connector-based automation. SpecFlow needs demonstrably fewer steps and more reliable voice corrections for a specific engineering workflow. Avoid claiming the overall category or voice dictation is unique.

## Setup needed for real company integrations

An AI model key alone is insufficient. Slack needs a registered application and OAuth configuration; Jira needs an approved integration and scoped permissions; email needs a separate OAuth application and appropriate scopes. A company MCP connection needs its endpoint and supported authorization. Configure sensitive values in server secret storage rather than sharing them in chat or committing them.

