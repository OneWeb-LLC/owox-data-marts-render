export interface RedeemLaunchTokenResult {
  accessToken: string;
  refreshToken?: string;
  orgId?: string;
  userId?: string;
}

export interface RedeemLaunchTokenError {
  error: string;
  status: number;
}

/**
 * Redeems an OWeb App Store SSO launch token for Supabase session tokens.
 * @see OneWeb-LLC/oweb `POST /api/v1/ecosystem/redeem-launch-token`
 */
export async function redeemOwebLaunchToken(
  controlPlaneOrigin: string,
  appId: string,
  launchToken: string
): Promise<RedeemLaunchTokenResult> {
  const url = new URL('/api/v1/ecosystem/redeem-launch-token', controlPlaneOrigin.replace(/\/$/, ''));
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ launch_token: launchToken, app_id: appId }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    org_id?: string;
    user_id?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(body.error ?? `redeem_failed_${response.status}`);
  }

  if (!body.access_token) {
    throw new Error('missing_access_token');
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    orgId: body.org_id,
    userId: body.user_id,
  };
}

/**
 * Builds the OWeb control-plane sign-in URL for constellation SSO return.
 */
export function buildOwebConstellationSignInUrl(
  signInUrl: string,
  ecosystemAppId: string
): string {
  const target = new URL(signInUrl);
  target.searchParams.set('launch', ecosystemAppId);
  target.searchParams.delete('redirect_to');
  target.searchParams.delete('redirect');
  return target.toString();
}