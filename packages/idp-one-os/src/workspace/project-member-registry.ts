import fs from 'node:fs';
import path from 'node:path';
import type { Payload, ProjectMember } from '@owox/idp-protocol';

interface RememberedMember {
  userId: string;
  projectId: string;
  email: string;
  fullName?: string;
  projectRole: string;
}

interface MemberFileSchema {
  members: RememberedMember[];
}

/**
 * People who have signed in to this satellite.
 *
 * One OS does not push a member directory. Storage, destination and report
 * ownership still require the creator to be a project member, so a signed-in
 * user who is missing here cannot create a storage. The registry is the
 * satellite's record of who has actually authenticated for each project.
 */
export class ProjectMemberRegistry {
  private members: RememberedMember[] = [];

  constructor(private readonly filePath: string) {
    this.members = this.load();
  }

  static pathBesideBindings(bindingsFilePath: string): string {
    return path.join(path.dirname(bindingsFilePath), 'one-os-project-members.json');
  }

  remember(payload: Payload): void {
    if (!payload.userId || !payload.projectId) return;
    const next: RememberedMember = {
      userId: payload.userId,
      projectId: payload.projectId,
      email: payload.email ?? '',
      fullName: payload.fullName,
      projectRole: payload.roles?.[0] ?? 'editor',
    };
    const index = this.members.findIndex(
      member => member.projectId === next.projectId && member.userId === next.userId
    );
    const current = index >= 0 ? this.members[index] : undefined;
    if (
      current &&
      current.email === next.email &&
      current.fullName === next.fullName &&
      current.projectRole === next.projectRole
    ) {
      return;
    }
    if (index >= 0) this.members[index] = next;
    else this.members.push(next);
    this.persist();
  }

  list(projectId: string): ProjectMember[] {
    return this.members
      .filter(member => member.projectId === projectId)
      .map(member => ({
        userId: member.userId,
        email: member.email,
        fullName: member.fullName,
        projectRole: member.projectRole,
        userStatus: 'active',
        hasNotificationsEnabled: false,
      }));
  }

  private load(): RememberedMember[] {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as MemberFileSchema;
      if (!Array.isArray(parsed.members)) return [];
      return parsed.members.filter(
        (member): member is RememberedMember =>
          !!member &&
          typeof member.userId === 'string' &&
          typeof member.projectId === 'string' &&
          typeof member.email === 'string' &&
          typeof member.projectRole === 'string'
      );
    } catch {
      return [];
    }
  }

  private persist(): void {
    const data: MemberFileSchema = {
      members: [...this.members].sort((a, b) =>
        `${a.projectId}:${a.userId}`.localeCompare(`${b.projectId}:${b.userId}`)
      ),
    };
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    } catch {
      // Keep the in-memory list. A disk failure must not fail the request that
      // just authenticated this person; the next request tries the write again.
    }
  }
}
