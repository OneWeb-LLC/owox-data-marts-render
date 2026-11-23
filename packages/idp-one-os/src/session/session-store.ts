import { randomBytes } from 'node:crypto';
import type { Payload } from '@owox/idp-protocol';

export interface StoredSession {
  id: string;
  payload: Payload;
  createdAt: number;
}

export class OneOsSessionStore {
  private readonly sessions = new Map<string, StoredSession>();

  create(payload: Payload): string {
    const id = randomBytes(24).toString('hex');
    this.sessions.set(id, { id, payload, createdAt: Date.now() });
    return id;
  }

  get(sessionId: string): StoredSession | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}