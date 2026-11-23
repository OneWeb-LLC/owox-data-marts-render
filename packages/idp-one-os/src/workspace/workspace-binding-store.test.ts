import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WorkspaceBindingStore } from './workspace-binding-store.js';

describe('WorkspaceBindingStore', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = path.join(os.tmpdir(), `bindings-${Date.now()}.json`);
  });

  afterEach(() => {
    fs.rmSync(filePath, { force: true });
  });

  it('activates and resolves project id', () => {
    const store = new WorkspaceBindingStore(filePath);
    store.activate({
      workspaceId: 'ws-1',
      satelliteUrl: 'https://owox.example.com',
      projectTitle: 'Acme',
    });

    expect(store.resolveProjectId('ws-1', '0')).toBe('ws-1');
    expect(store.get('ws-1')?.projectTitle).toBe('Acme');
  });

  it('suspends a workspace', () => {
    const store = new WorkspaceBindingStore(filePath);
    store.activate({ workspaceId: 'ws-2', satelliteUrl: 'https://owox.example.com' });
    store.suspend('ws-2');
    expect(store.get('ws-2')?.status).toBe('suspended');
    expect(store.resolveProjectId('ws-2', '0')).toBe('0');
  });
});