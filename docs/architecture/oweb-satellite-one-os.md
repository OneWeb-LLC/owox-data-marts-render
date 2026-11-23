# Oweb satellite on Render with One OS

This document is the reference architecture for running **OWOX Data Marts** as an
**Oweb satellite**: the data plane (connectors, data marts, schedules) on Render,
**One OS** (Supabase) owning identity and organization in the target state, and
**customer warehouses** (for example Google BigQuery) holding marketing and
analytics data.

It does not change product behavior. It records where data lives, what OWOX
supports today, and the phased path to One OS sign-in and workspace activation.

## Goals

1. **Render** runs the OWOX application, connectors, data marts, and in-process
   scheduler.
2. **One OS / Supabase** owns user identity, organization, and sign-in after a
   dedicated identity-provider integration ships (not available in core OWOX yet).
3. **OWOX application database** stores orchestration and configuration only. It is
   separate from the marketing warehouse.
4. **Marketing and performance data** live in a [supported storage](../storages/)
   (for example BigQuery), not in Supabase Postgres, unless you deliberately add
   a Postgres destination or connector path.

## Logical architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ One OS (Supabase) — target identity plane                        │
│   Auth, organizations / workspaces, oMetrics app data (Postgres)   │
└────────────────────────────┬────────────────────────────────────┘
                             │ JWT + workspace_id (future IdP bridge)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Oweb satellite — OWOX on Render                                  │
│   Web service (GHCR image or Dockerfile build)                     │
│   Better Auth today → Supabase IdP when implemented              │
│   Scheduler (single instance recommended)                          │
│   Optional disk: SQLite files or DuckDB data dir                   │
└──────────────┬──────────────────────────────┬─────────────────────┘
               │                              │
               ▼                              ▼
   External MySQL (recommended)         Customer warehouse
   or SQLite on Render disk            (BigQuery, Snowflake, …)
   OWOX app DB + Better Auth tables    Marketing / analytics tables
```

## Where each type of data lives

| Data | Owner in target state | OWOX today | Typical location |
| ---- | -------------------- | ---------- | ---------------- |
| Sign-in, sessions | One OS / Supabase | Better Auth (`IDP_PROVIDER=better-auth`) | Interim: IDP tables in app MySQL or SQLite on disk. Target: Supabase Auth |
| Organization / workspace | One OS | OWOX **projects** + members in app DB | Supabase metadata; **mapping** `workspace_id` ↔ `projectId` (to be built) |
| Data marts, connectors, runs, triggers, API keys | OWOX | App database (`DB_TYPE=mysql` or `sqlite`) | External **MySQL** or SQLite on [Render disk](../getting-started/deployment-guide/render-oweb-satellite.md) |
| Storage credentials (warehouse bindings) | OWOX | App database | Same as app DB |
| Marketing / ads facts and dimensions | Customer warehouse | Configured **storages** in UI | **BigQuery** (etc.), not Supabase by default |
| oMetrics product data | oMetrics | Outside OWOX | Supabase Postgres |
| Optional DuckDB storage files | OWOX (self-managed) | Local files when enabled | Render persistent disk; single instance only |

OWOX already separates **app metadata** from **warehouse tables**. Treat
Supabase as the identity and oMetrics store, not as the default marketing
warehouse.

## Fit with OWOX supported architecture

| Requirement | Supported now? |
| ----------- | -------------- |
| Self-managed app on Render (container image) | Yes |
| `DB_TYPE=mysql` for app DB | Yes (MySQL **outside** Render; see [DigitalOcean](../getting-started/deployment-guide/digitalocean.md) pattern) |
| Schedules in the same service as the API | Yes (`SCHEDULER_EXECUTION_ENABLED`; avoid multiple instances without a distributed runner) |
| BigQuery (and other listed storages) for marketing data | Yes |
| Supabase / One OS as `IdpProvider` | **Preview** — `IDP_PROVIDER=one-os` ([`@owox/idp-one-os`](../../packages/idp-one-os/)); member admin + activation still Phase C |
| “Activate OWOX for workspace X” in One OS | **No** — product workflow + mapping store |
| Render Managed Postgres as OWOX `DB_TYPE` | **No** — OWOX app DB is SQLite or MySQL |

## Phased delivery

### Phase A — Satellite live (interim auth)

**Outcome:** Production OWOX on Render with full connectors and schedules;
Better Auth; app DB on external MySQL (or SQLite on disk for early pilots).

**Checklist:**

- [ ] Render web service from `ghcr.io/owox/owox-data-marts:next` or `latest`
- [ ] `PUBLIC_ORIGIN`, `IDP_PROVIDER=better-auth`, `IDP_BETTER_AUTH_SECRET`
- [ ] `DB_TYPE=mysql` + connection vars (or SQLite + disk)
- [ ] One instance; optional disk mount `/root/.local/share/owox/`
- [ ] [License key](../getting-started/deployment-guide/license-key-setup.md) if Report Runs must not be RESTRICTED
- [ ] Add warehouse storage (BigQuery) in project settings
- [ ] First admin via Render Shell: `owox idp add-user …`

Operational detail: [Render Oweb satellite](../getting-started/deployment-guide/render-oweb-satellite.md).

### Phase B — One OS identity bridge (engineering)

**Preview (in repo):** `IDP_PROVIDER=one-os` via [`@owox/idp-one-os`](../../packages/idp-one-os/).
Supabase JWT callback, session cookie, workspace → project mapping. Member admin and
activation API remain Phase C.

**Outcome:** Sign-in through Supabase; OWOX issues and accepts tokens via a new
`IdpProvider`; no parallel Better Auth user directory.

**Minimum design decisions:**

1. **JWT claims:** `sub`, email, `workspace_id` (or org slug), roles mapped to OWOX
   `Role` and `projectId`.
2. **Project provisioning:** On “enable OWOX” for a workspace, create or bind one
   OWOX project; persist `workspace_id` ↔ `project_id`.
3. **Member sync:** Invite and role changes in One OS propagate to OWOX project
   members (webhooks or periodic sync).
4. **Cutover:** Export Better Auth users or require re-invite; single `PUBLIC_ORIGIN`.

**Out of scope for Phase B unless explicitly scoped:** Supabase as marketing
warehouse; Render Managed Postgres as app DB.

### Phase C — Workspace activation UX

**Outcome:** In One OS or oMetrics, an admin toggles OWOX for an organization;
users land in the same logical workspace with SSO.

Depends on Phase B and a small **activation API** (create/bind project, return
satellite URL).

## Conflicts to avoid

- **Two IdPs:** Better Auth on Render and Supabase for oMetrics without a bridge
  duplicates users and breaks “same workspace.”
- **Multiple Render instances** with scheduler enabled: duplicate cron runs.
- **DuckDB + MySQL + scale-out:** DuckDB files are instance-local; keep one writer.
- **Supabase Postgres for marketing facts:** Not the default OWOX path; use BigQuery
  unless you fund a Postgres storage/connector initiative.

## Docker image build vs runtime

The multi-stage `Dockerfile` fix only affects **building** the image from Git when
`docker-packages/` is missing. It does **not** change runtime env vars, auth, or data
placement. Production satellites should still prefer pulling **GHCR** tags unless you
maintain a custom image fork.

## Related docs

- [Render Oweb satellite (operations)](../getting-started/deployment-guide/render-oweb-satellite.md)
- [Render (baseline)](../getting-started/deployment-guide/render.md)
- [Environment variables](../getting-started/deployment-guide/environment-variables.md)
- [BigQuery storage](../storages/supported-storages/google-bigquery.md)