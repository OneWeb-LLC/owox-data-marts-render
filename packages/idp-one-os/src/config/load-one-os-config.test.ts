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