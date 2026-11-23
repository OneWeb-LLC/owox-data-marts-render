# Render: Oweb satellite (production pattern)

Use this guide when **Oweb** runs OWOX Data Marts on Render as a **satellite**
data plane: connectors, data marts, and schedules on Render; **Better Auth** for
sign-in until One OS / Supabase integration ships; **MySQL** (recommended) or
SQLite for the OWOX app database; **BigQuery** (or another
[supported storage](../../storages/)) for marketing warehouse data.

For the full multi-product picture (One OS, oMetrics, phased auth), read
[Oweb satellite architecture](../../architecture/oweb-satellite-one-os.md).

For the minimal Render quick start (image + disk + Better Auth only), see
[Render](./render.md).

## Prerequisites

- [Render](https://render.com) account with a **paid plan** if you need
  persistent disk and Shell
- **External MySQL 8** (Render does not offer managed MySQL). Examples:
  [DigitalOcean Managed MySQL](https://cloud.digitalocean.com/databases/new),
  PlanetScale, Amazon RDS, etc.
- Optional: [OWOX license key](./license-key-setup.md) bound to your `PUBLIC_ORIGIN`

## Recommended topology

| Component | Where it runs |
| --------- | ------------- |
| OWOX container | Render **Web Service** |
| App DB + Better Auth tables | **External MySQL** (same database or separate schemas) |
| Scheduler | Same web service (**one instance**) |
| DuckDB files (optional) | Render **disk** at `/root/.local/share/owox/` (single instance only) |
| Marketing data | **BigQuery** (configured in OWOX UI as a storage) |

Render **does** offer managed **PostgreSQL**, but OWOX self-managed installs support only
`DB_TYPE=sqlite` or `DB_TYPE=mysql` for the **application database** — not Render Postgres.
Use **external MySQL** (or SQLite on a Render disk). Do not point `DATABASE_URL` from Render
Postgres at OWOX unless you add a full Postgres app-DB port (not supported today).

## Step 1 — Create the web service

1. **New → Web Service**
2. Source: **Existing image** (recommended)
   - Image: `ghcr.io/owox/owox-data-marts:next` for snapshots, or `:latest` for releases
3. **Instance type:** Standard or higher (connectors and builds need CPU/RAM)
4. **Instance count:** **1** (scheduler runs in-process)
5. **Health check path:** `/` or your platform default; timeout **10–15s**

### Optional: deploy from your Git fork

Use this only when you need custom commits. The repository `Dockerfile` packs
workspaces inside the image when `docker-packages/` is absent. Prefer GHCR for
routine upgrades.

## Step 2 — External MySQL

1. Create a MySQL 8 database at your provider.
2. Create a dedicated database (for example `owox`).
3. Allow connections from Render (provider firewall / trusted sources).
4. Note host, port, username, password, database name.
5. Enable TLS if the provider requires it (`DB_MYSQL_SSL=true` — see
   [MySQL SSL](./environment-variables.md#mysql-ssl)).

Better Auth can share the same MySQL server:

- Set `IDP_BETTER_AUTH_DATABASE_TYPE=mysql` (defaults follow `DB_TYPE` when unset).
- Optionally use the same `DB_*` credentials or separate `IDP_BETTER_AUTH_MYSQL_*` vars.

Run migrations on first start (`owox serve` applies them automatically).

## Step 3 — Environment variables

Set in Render **Environment** (use **Secret** type for passwords):

| Variable | Required | Example / notes |
| -------- | -------- | ---------------- |
| `PUBLIC_ORIGIN` | Yes | `https://owox-your-org.onrender.com` (no trailing `/`) |
| `PORT` | Auto | Render sets this; leave default unless overriding |
| `LOG_FORMAT` | Recommended | `json` |
| `DB_TYPE` | Yes | `mysql` |
| `DB_HOST` | Yes | MySQL hostname |
| `DB_PORT` | Yes | e.g. `25060` (DO) or `3306` |
| `DB_USERNAME` | Yes | |
| `DB_PASSWORD` | Yes | Secret |
| `DB_DATABASE` | Yes | |
| `DB_MYSQL_SSL` | Often | `true` or JSON SSL options |
| `IDP_PROVIDER` | Yes | `better-auth` (until One OS IdP exists) |
| `IDP_BETTER_AUTH_SECRET` | Yes | `openssl rand -base64 32` |
| `IDP_BETTER_AUTH_DATABASE_TYPE` | Recommended | `mysql` |
| `SCHEDULER_EXECUTION_ENABLED` | Optional | `true` (default) |
| `LICENSE_KEY` | If needed | JWT from OWOX Cloud license keys |
| `DUCKDB_STORAGE_ENABLED` | Optional | `false` with MySQL unless using disk + single instance |

See [`.env.example`](../../../.env.example) and
[environment-variables.md](./environment-variables.md) for the full list.

### Bulk example (replace placeholders)

```text
PUBLIC_ORIGIN=https://owox-your-org.onrender.com
LOG_FORMAT=json
DB_TYPE=mysql
DB_HOST=your-mysql-host.example.com
DB_PORT=3306
DB_USERNAME=owox_app
DB_PASSWORD=replace-me
DB_DATABASE=owox
DB_MYSQL_SSL=true
IDP_PROVIDER=better-auth
IDP_BETTER_AUTH_SECRET=replace-with-openssl-rand-base64-32
IDP_BETTER_AUTH_DATABASE_TYPE=mysql
SCHEDULER_EXECUTION_ENABLED=true
```

## Step 4 — Optional persistent disk

Required for **SQLite** deployments; **optional** for MySQL-only satellites.

1. Advanced → **Disks** → add disk (e.g. 5 GB+)
2. Mount path: `/root/.local/share/owox/`
3. If you enable DuckDB: set `DUCKDB_STORAGE_ENABLED=true` and keep **one**
   instance (`DUCKDB_DATA_DIR` defaults under the SQLite path; override on disk if needed)

With `DB_TYPE=mysql`, the app database does not need a disk; use a disk only for
DuckDB or local file artifacts.

## Step 5 — First admin and warehouse

1. Open **Shell** on the Render service.
2. Run: `owox idp add-user you@your-company.com`
3. Open the magic link, set a password, sign in.
4. In the UI: **Project → Storages** → add **Google BigQuery** (or another
   supported storage).
5. Create data marts and connectors; schedules use the in-process scheduler.

Invite teammates via `/auth` ([Better Auth members guide](../setup-guide/members-management/better-auth.md)).

## Upgrades

- **Image deploys:** In Render, trigger **Manual Deploy** or enable auto-deploy
  on a new GHCR tag.
- **Git Dockerfile deploys:** Push to the connected branch; allow time for the
  in-image pack + build on first Dockerfile deploy.

## Troubleshooting

| Symptom | Likely cause | Action |
| ------- | ------------- | ------ |
| 504 / health check fail | Slow cold start or wrong port | App must listen on `0.0.0.0` and `$PORT`; increase health timeout |
| DB connection errors | Firewall or SSL | Allow Render egress; set `DB_MYSQL_SSL` |
| Duplicate scheduled runs | **>1** instance | Scale to 1 or use a distributed scheduler strategy |
| Report runs RESTRICTED | Missing/invalid license | Add `LICENSE_KEY` for `PUBLIC_ORIGIN` |
| Blank UI | `PUBLIC_ORIGIN` mismatch | Must exactly match the browser URL (scheme + host) |

## One OS sign-in (preview)

When One OS (Supabase) should own sign-in:

1. Set `IDP_PROVIDER=one-os` and configure [`@owox/idp-one-os`](../../../packages/idp-one-os/README.md) variables.
2. Set `IDP_ONE_OS_SIGN_IN_URL` to your One OS login page.
3. Configure One OS to redirect after login to  
   `{PUBLIC_ORIGIN}/auth/one-os/callback?access_token=<supabase_access_token>`.
4. Map workspaces: `IDP_ONE_OS_WORKSPACE_PROJECT_MAP='{"<workspace-uuid>":"0"}'`.
5. Plan cutover from Better Auth (export users or re-invite).

Member invites and workspace activation UI remain Phase C — see
[oweb-satellite-one-os.md](../../architecture/oweb-satellite-one-os.md).