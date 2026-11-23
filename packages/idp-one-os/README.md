# @owox/idp-one-os

**Phase B (preview)** identity provider that bridges **One OS / Supabase Auth** to the
[`@owox/idp-protocol`](../idp-protocol/) contract for **Oweb satellite** deployments.

## Status

- Validates Supabase user JWTs (HS256 secret or JWKS).
- Exchanges a Supabase access token on `/auth/one-os/callback` for an http-only OWOX
  session cookie.
- Issues OWOX API access tokens for the React app (`/auth/access-token`).
- Maps `app_metadata.workspace_id` → OWOX `projectId` via `IDP_ONE_OS_WORKSPACE_PROJECT_MAP`.
- Member invites, MCP OAuth, and Better Auth–style user admin are **not** implemented — manage
  users in One OS; manage project membership in Phase C.

## Configuration

Set `IDP_PROVIDER=one-os` and:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `PUBLIC_ORIGIN` or `IDP_ONE_OS_BASE_URL` | Yes | Satellite URL (callback base) |
| `IDP_ONE_OS_SUPABASE_URL` or `SUPABASE_URL` | Yes | Supabase project URL |
| `IDP_ONE_OS_SESSION_SECRET` | Yes | Min 32 chars; signs OWOX access JWTs |
| `IDP_ONE_OS_SIGN_IN_URL` | Yes | One OS login page; `redirect_to` appended when missing |
| `IDP_ONE_OS_SUPABASE_JWT_SECRET` or `SUPABASE_JWT_SECRET` | No* | HS256 JWT secret (*omit for JWKS) |
| `IDP_ONE_OS_WORKSPACE_PROJECT_MAP` | No | JSON `{"workspace-uuid":"0"}` |
| `IDP_ONE_OS_DEFAULT_PROJECT_ID` | No | Default `0` |
| `IDP_ONE_OS_ADMIN_EMAILS` | No | Comma list → `admin` role |
| `IDP_ONE_OS_DEFAULT_ROLE` | No | `editor` default |

## Sign-in flow

1. User hits `/auth/sign-in` → redirect to `IDP_ONE_OS_SIGN_IN_URL`.
2. After Supabase login, One OS redirects to  
   `{PUBLIC_ORIGIN}/auth/one-os/callback?access_token=<supabase_jwt>`.
3. Satellite sets session cookie and redirects into the app.
4. Web app calls `POST /auth/access-token` (unchanged).

See [Oweb satellite architecture](../../docs/architecture/oweb-satellite-one-os.md).