import * as jose from 'jose';

export interface VerifiedSupabaseUser {
  userId: string;
  email?: string;
  claims: jose.JWTPayload;
}

/**
 * Verifies a Supabase access token (user JWT) using HS256 secret or project JWKS.
 */
export async function verifySupabaseAccessToken(
  token: string,
  supabaseUrl: string,
  jwtSecret?: string
): Promise<VerifiedSupabaseUser> {
  const issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;

  let payload: jose.JWTPayload;
  if (jwtSecret) {
    const key = new TextEncoder().encode(jwtSecret);
    ({ payload } = await jose.jwtVerify(token, key, {
      issuer,
      audience: 'authenticated',
    }));
  } else {
    const jwksUrl = new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`);
    const jwks = jose.createRemoteJWKSet(jwksUrl);
    ({ payload } = await jose.jwtVerify(token, jwks, {
      issuer,
      audience: 'authenticated',
    }));
  }

  const sub = payload.sub;
  if (!sub || typeof sub !== 'string') {
    throw new Error('Supabase JWT is missing sub');
  }

  const email = typeof payload.email === 'string' ? payload.email : undefined;

  return { userId: sub, email, claims: payload };
}

/**
 * Reads a dotted claim path from a JWT payload (e.g. `app_metadata.workspace_id`).
 */
export function readClaimPath(payload: jose.JWTPayload, path: string): unknown {
  const parts = path.split('.').filter(Boolean);
  let current: unknown = payload;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}