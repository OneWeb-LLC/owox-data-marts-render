import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Payload } from '@owox/idp-protocol';

import { OneOsIdpProvider } from '../one-os-idp-provider.js';
import type { OneOsIdpConfig } from '../config/load-one-os-config.js';
import { signAccessToken } from '../tokens/access-token.js';
import { ProjectMemberRegistry } from './project-member-registry.js';

const SECRET = 's'.repeat(32);

function payload(overrides: Partial<Payload> = {}): Payload {
  return {
    userId: 'user-1',
    projectId: '0',
    email: 'ada@example.com',
    fullName: 'Ada',
    roles: ['admin'],
    ...overrides,
  };
}

describe('ProjectMemberRegistry', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = path.join(os.tmpdir(), `members-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(() => {
    fs.rmSync(filePath, { force: true });
  });

  it('remembers a signed-in user once and lists them for that project only', () => {
    const registry = new ProjectMemberRegistry(filePath);
    registry.remember(payload());
    registry.remember(payload());

    expect(registry.list('0')).toEqual([
      {
        userId: 'user-1',
        email: 'ada@example.com',
        fullName: 'Ada',
        projectRole: 'admin',
        userStatus: 'active',
        hasNotificationsEnabled: false,
      },
    ]);
    expect(registry.list('other')).toEqual([]);

    const reloaded = new ProjectMemberRegistry(filePath);
    expect(reloaded.list('0')).toHaveLength(1);
  });

  it('updates the role when the same person signs in again', () => {
    const registry = new ProjectMemberRegistry(filePath);
    registry.remember(payload({ roles: ['viewer'] }));
    registry.remember(payload({ roles: ['editor'] }));
    expect(registry.list('0')[0]?.projectRole).toBe('editor');
  });
});

describe('OneOsIdpProvider project members', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'one-os-members-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('treats a verified access token as membership before ownership checks', async () => {
    const config: OneOsIdpConfig = {
      baseUrl: 'https://ometrics.example.com',
      supabaseUrl: 'https://auth.example.com',
      sessionSecret: SECRET,
      signInUrl: 'https://oweb.one/login',
      workspaceProjectMap: {},
      defaultProjectId: '0',
      projectTitle: 'Oweb workspace',
      defaultRole: 'editor',
      adminEmails: new Set(),
      workspaceClaimPath: 'app_metadata.workspace_id',
      roleClaimPath: 'app_metadata.owox_role',
      accessTokenTtlSeconds: 900,
      sessionCookieMaxAgeMs: 1000,
      bindingsFilePath: path.join(dir, 'bindings.json'),
      owebControlPlaneUrl: 'https://oweb.one',
    };
    const provider = new OneOsIdpProvider(config);
    expect(await provider.getProjectMembers('0')).toEqual([]);

    const token = await signAccessToken(payload(), SECRET, 900);
    expect((await provider.introspectToken(token))?.userId).toBe('user-1');

    const members = await provider.getProjectMembers('0');
    expect(members.map(member => member.userId)).toEqual(['user-1']);
    await provider.introspectToken(token);
    expect(await provider.getProjectMembers('0')).toHaveLength(1);
  });
});
