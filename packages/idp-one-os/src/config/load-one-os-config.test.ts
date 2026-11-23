import { loadOneOsIdpConfigFromEnv } from './load-one-os-config.js';

describe('loadOneOsIdpConfigFromEnv', () => {
  it('loads minimal valid configuration', () => {
    const config = loadOneOsIdpConfigFromEnv({
      PUBLIC_ORIGIN: 'https://owox.example.com',
      IDP_ONE_OS_SUPABASE_URL: 'https://abc.supabase.co',
      IDP_ONE_OS_SESSION_SECRET: 'x'.repeat(32),
      IDP_ONE_OS_SIGN_IN_URL: 'https://one-os.example.com/login',
      IDP_ONE_OS_WORKSPACE_PROJECT_MAP: '{"ws-1":"0"}',
    });

    expect(config.baseUrl).toBe('https://owox.example.com');
    expect(config.workspaceProjectMap).toEqual({ 'ws-1': '0' });
    expect(config.defaultRole).toBe('editor');
    expect(config.owebControlPlaneUrl).toBe('https://oweb.one');
    expect(config.ecosystemAppId).toBeUndefined();
  });

  it('loads constellation SSO settings', () => {
    const config = loadOneOsIdpConfigFromEnv({
      PUBLIC_ORIGIN: 'https://ometrics.onrender.com',
      IDP_ONE_OS_SUPABASE_URL: 'https://auth.oweb.one',
      IDP_ONE_OS_SESSION_SECRET: 'x'.repeat(32),
      IDP_ONE_OS_SIGN_IN_URL: 'https://oweb.one/login',
      IDP_ONE_OS_ECOSYSTEM_APP_ID: 'ometrics',
      IDP_ONE_OS_OWEB_CONTROL_PLANE_URL: 'https://oweb.one',
    });
    expect(config.ecosystemAppId).toBe('ometrics');
    expect(config.owebControlPlaneUrl).toBe('https://oweb.one');
  });

  it('rejects short session secret', () => {
    expect(() =>
      loadOneOsIdpConfigFromEnv({
        PUBLIC_ORIGIN: 'https://owox.example.com',
        IDP_ONE_OS_SUPABASE_URL: 'https://abc.supabase.co',
        IDP_ONE_OS_SESSION_SECRET: 'short',
        IDP_ONE_OS_SIGN_IN_URL: 'https://one-os.example.com/login',
      })
    ).toThrow(/32/);
  });
});