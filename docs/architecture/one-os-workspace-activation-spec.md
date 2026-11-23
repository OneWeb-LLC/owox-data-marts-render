# One OS workspace activation (specification draft)

**Status:** Design — not implemented in OWOX core.  
**Parent:** [Oweb satellite architecture](./oweb-satellite-one-os.md)

This specifies the smallest product behavior to **activate OWOX for a One OS
workspace** so oMetrics and OWOX share organization context and (after Phase B)
a single sign-in.

## Definitions

| Term | Meaning |
| ---- | ------- |
| **One OS workspace** | Organization tenant in Supabase (row + `workspace_id` in JWT) |
| **OWOX project** | Project inside one OWOX satellite deployment |
| **Satellite** | Single OWOX instance (e.g. `https://owox-oweb.onrender.com`) |
| **Activation** | Binding `(satellite, workspace_id)` → `project_id` and enabling access |

## User stories

1. As a One OS admin, I enable **OWOX** for my workspace so my team can use data
   marts without a second login (post Phase B).
2. As a user, when I open OWOX from One OS, I land in the **project** that
   matches my workspace.
3. As a One OS admin, when I remove a member from the workspace, they lose access
   to the bound OWOX project.

## Minimal data model (suggested)

Stored in **Supabase** (One OS) or a small satellite-side table owned by the
future activation service:

```text
owox_satellite_bindings
  id                uuid PK
  workspace_id      uuid NOT NULL UNIQUE  -- One OS workspace
  satellite_url     text NOT NULL         -- PUBLIC_ORIGIN of OWOX
  owox_project_id   text NOT NULL         -- from OWOX API after provision
  created_at        timestamptz
  status            text                  -- active | suspended
```

Provisioning flow creates the OWOX project via trusted API (service account or
bootstrap admin), then inserts the binding row.

## Minimal API surface (suggested)

| Endpoint | Caller | Action |
| -------- | ------ | ------ |
| `POST /internal/owox/activate` | One OS backend | Given `workspace_id`, create OWOX project on satellite, return `project_id` |
| `GET /internal/owox/bindings/:workspace_id` | One OS | Resolve `satellite_url` + `project_id` for deep links |
| `DELETE /internal/owox/activate/:workspace_id` | One OS admin | Suspend binding; optionally archive OWOX project |

All endpoints require mTLS or signed service tokens between One OS and the
satellite. Do not expose without authentication.

## Identity (Phase B dependency)

A future `IdpProvider` must:

1. Validate Supabase JWT (issuer, audience, JWKS).
2. Map `sub` → OWOX `userId` (JIT user row or lookup table).
3. Map `workspace_id` from token or header → `projectId` via `owox_satellite_bindings`.
4. Map One OS roles → OWOX `Role` set for that project.
5. Implement required `IdpProvider` methods (tokens, members, invites, MCP — scope
   per phased rollout).

Until Phase B ships, activation can create projects but users still sign in with
Better Auth on the satellite.

## Deep link flow (target)

```text
One OS UI → "Open OWOX"
  → resolve binding(workspace_id) → satellite_url
  → redirect to satellite /auth with One OS OAuth/OIDC (future)
  → session with project context = owox_project_id
```

## Non-goals (this spec)

- Storing marketing metrics in Supabase
- Using Render Postgres as OWOX app DB
- Multi-satellite federation per workspace (v1: one binding per workspace)

## Acceptance criteria (v1)

- [ ] Documented binding table and provision API
- [ ] One test workspace can be activated manually (scripted)
- [ ] OWOX project exists and BigQuery storage can be added independently
- [ ] IdP cutover checklist written before disabling Better Auth