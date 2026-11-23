import { RoleEnum, type Role } from '@owox/idp-protocol';
import { z } from 'zod';

const WorkspaceMapSchema = z.record(z.string(), z.string());

export interface OneOsIdpConfig {
  baseUrl: string;
  supabaseUrl: string;
  /** HS256 JWT secret from Supabase project settings. Omit to use JWKS (ES256). */
  supabaseJwtSecret?: string;
  /** Signs OWOX access tokens issued to the web app (min 32 characters). */
  sessionSecret: string;
  /** Browser URL where users sign in with One OS (Supabase). */
  signInUrl: string;
  /** Maps One OS workspace UUID → OWOX project id. */
  workspaceProjectMap: Record<string, string>;
  defaultProjectId: string;
  projectTitle: string;
  defaultRole: Role;
  adminEmails: Set<string>;
  /** Dot path on the Supabase JWT payload for workspace id. */
  workspaceClaimPath: string;
  /** Dot path for OWOX role override (optional). */
  roleClaimPath: string;
  accessTokenTtlSeconds: number;
  sessionCookieMaxAgeMs: number;
}

function parseRole(value: string | undefined, fallback: Role): Role {
  if (!value) return fallback;
  const parsed = RoleEnum.safeParse(value.trim().toLowerCase());
  return parsed.success ? parsed.data : fallback;
}

function parseWorkspaceMap(raw: string | undefined): Record<string, string> {
  if (!raw || raw.trim() === '') return {};
  try {
    return WorkspaceMapSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new Error(
      `IDP_ONE_OS_WORKSPACE_PROJECT_MAP must be JSON object workspaceId→projectId: ${(error as Error).message}`
    );
  }
}

/**
 * Loads One OS IdP configuration from environment variables.
 */
export function loadOneOsIdpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): OneOsIdpConfig {
  const baseUrl = (env.IDP_ONE_OS_BASE_URL ?? env.PUBLIC_ORIGIN ?? '').replace(/\/$/, '');
  const supabaseUrl = (env.IDP_ONE_OS_SUPABASE_URL ?? env.SUPABASE_URL ?? '').replace(/\/$/, '');
  const sessionSecret = env.IDP_ONE_OS_SESSION_SECRET ?? '';
  const signInUrl = env.IDP_ONE_OS_SIGN_IN_URL ?? '';

  if (!baseUrl) {
    throw new Error('IDP_ONE_OS_BASE_URL or PUBLIC_ORIGIN is required for IDP_PROVIDER=one-os');
  }
  if (!supabaseUrl) {
    throw new Error('IDP_ONE_OS_SUPABASE_URL or SUPABASE_URL is required for IDP_PROVIDER=one-os');
  }
  if (sessionSecret.length < 32) {
    throw new Error('IDP_ONE_OS_SESSION_SECRET must be at least 32 characters');
  }
  if (!signInUrl) {
    throw new Error('IDP_ONE_OS_SIGN_IN_URL is required for IDP_PROVIDER=one-os');
  }

  const supabaseJwtSecret =
    env.IDP_ONE_OS_SUPABASE_JWT_SECRET ?? env.SUPABASE_JWT_SECRET ?? undefined;

  const defaultRole = parseRole(env.IDP_ONE_OS_DEFAULT_ROLE, 'editor');
  const adminEmails = new Set(
    (env.IDP_ONE_OS_ADMIN_EMAILS ?? '')
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  );

  return {
    baseUrl,
    supabaseUrl,
    supabaseJwtSecret: supabaseJwtSecret?.trim() || undefined,
    sessionSecret,
    signInUrl,
    workspaceProjectMap: parseWorkspaceMap(env.IDP_ONE_OS_WORKSPACE_PROJECT_MAP),
    defaultProjectId: env.IDP_ONE_OS_DEFAULT_PROJECT_ID ?? '0',
    projectTitle: env.IDP_ONE_OS_PROJECT_TITLE ?? 'Oweb workspace',
    defaultRole,
    adminEmails,
    workspaceClaimPath: env.IDP_ONE_OS_WORKSPACE_CLAIM_PATH ?? 'app_metadata.workspace_id',
    roleClaimPath: env.IDP_ONE_OS_ROLE_CLAIM_PATH ?? 'app_metadata.owox_role',
    accessTokenTtlSeconds: Number.parseInt(env.IDP_ONE_OS_ACCESS_TOKEN_TTL ?? '900', 10),
    sessionCookieMaxAgeMs: Number.parseInt(env.IDP_ONE_OS_SESSION_MAX_AGE_MS ?? '2592000000', 10),
  };
}