# @owox/idp-one-os

**Phase B (preview)** identity provider that bridges **One OS / Supabase Auth** to the
[`@owox/idp-protocol`](../idp-protocol/) contract for **Oweb satellite** deployments.

## Status

- Validates Supabase user JWTs (HS256 secret or JWKS).
- Exchanges a Supabase access token on `/auth/one-os/callback` for an http-only OWOX
  session cookie.
- Issues OWOX API access tokens for the React app (`/auth/access-token`).
- Maps `app_metadata.workspace_id` → OWOX `projectId` via `IDP_ONE_OS_WORKSPACE_PROJECT_MAP`.
- **Phase C:** workspace activation API persists bindings on disk; see below.
- Member invites, MCP OAuth, and Better Auth–style user admin are **not** implemented — manage
  users in One OS.

## Workspace activation (Phase C)

Requires `IDP_ONE_OS_ACTIVATION_SECRET` (≥32 chars). One OS backend calls (Bearer token):

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/internal/one-os/workspaces/activate` | Body `{ workspaceId, projectId?, projectTitle? }` |
| `GET` | `/internal/one-os/workspaces/:workspaceId/binding` | Resolve deep link |
| `DELETE` | `/internal/one-os/workspaces/:workspaceId` | Suspend |

Bindings file: `IDP_ONE_OS_BINDINGS_FILE` or `<data>/one-os-workspace-bindings.json` (use Render
disk mount for persistence).

## Configuration

Set `IDP_PROVIDER=one-os` and:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `PUBLIC_ORIGIN` or `IDP_ONE_OS_BASE_URL` | Yes | Satellite URL (callback base) |
| `IDP_ONE_OS_SUPABASE_URL` or `SUPABASE_URL` | Yes | Supabase project URL |
| `IDP_ONE_OS_SESSION_SECRET` | Yes | Min 32 chars; signs OWOX access JWTs |
| `IDP_ONE_OS_SIGN_IN_URL` | Yes | OWeb login (`https://oweb.one/login`) for constellation SSO |
| `IDP_ONE_OS_ECOSYSTEM_APP_ID` | Recommended | OWeb App Store id (e.g. `ometrics`) — enables `?launch=` + `/auth/sso` |
| `IDP_ONE_OS_OWEB_CONTROL_PLANE_URL` | No | Default `https://oweb.one` — SSO token redeem API |
| `IDP_ONE_OS_SUPABASE_JWT_SECRET` or `SUPABASE_JWT_SECRET` | No* | HS256 JWT secret (*omit for JWKS) |
| `IDP_ONE_OS_WORKSPACE_PROJECT_MAP` | No | JSON `{"workspace-uuid":"0"}` |
| `IDP_ONE_OS_DEFAULT_PROJECT_ID` | No | Default `0` |
| `IDP_ONE_OS_ADMIN_EMAILS` | No | Comma list → `admin` role |
| `IDP_ONE_OS_DEFAULT_ROLE` | No | `editor` default |

## Sign-in flow (OWeb constellation — recommended)

Requires `IDP_ONE_OS_ECOSYSTEM_APP_ID` and `launchUrl` set for your app in OWeb
`ecosystem-apps.ts`.

1. User hits `/auth/sign-in` → redirect to `{IDP_ONE_OS_SIGN_IN_URL}?launch=<app_id>`.
2. User authenticates on **OWeb** (not another satellite).
3. OWeb App Store mints SSO → `{PUBLIC_ORIGIN}/auth/sso?launch_token=…`.
4. Satellite redeems via `POST {oweb.one}/api/v1/ecosystem/redeem-launch-token`, sets session cookie.
5. Web app calls `POST /auth/access-token` (unchanged).

## Sign-in flow (legacy direct callback)

When `IDP_ONE_OS_ECOSYSTEM_APP_ID` is unset:

1. `/auth/sign-in` → `IDP_ONE_OS_SIGN_IN_URL` with `redirect_to={PUBLIC_ORIGIN}/auth/one-os/callback`.
2. Identity plane redirects with `?access_token=<supabase_jwt>`.
3. `/auth/one-os/callback` sets session cookie.

See [Oweb satellite architecture](../../docs/architecture/oweb-satellite-one-os.md).