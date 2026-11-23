import fs from 'node:fs';
import path from 'node:path';

export type WorkspaceBindingStatus = 'active' | 'suspended';

export interface WorkspaceBinding {
  workspaceId: string;
  projectId: string;
  projectTitle: string;
  satelliteUrl: string;
  status: WorkspaceBindingStatus;
  createdAt: string;
  updatedAt: string;
}

interface BindingFileSchema {
  bindings: WorkspaceBinding[];
}

/**
 * Persists One OS workspace ↔ OWOX project bindings on the satellite filesystem.
 */
export class WorkspaceBindingStore {
  constructor(private readonly filePath: string) {}

  static resolveDefaultPath(
    explicit: string | undefined,
    satelliteUrl: string
  ): string {
    if (explicit && explicit.trim() !== '') {
      return path.resolve(explicit);
    }
    return path.join(
      process.env.OWOX_DATA_DIR?.trim() || path.join(process.cwd(), '.local/share/owox'),
      'one-os-workspace-bindings.json'
    );
  }

  activate(input: {
    workspaceId: string;
    projectId?: string;
    projectTitle?: string;
    satelliteUrl: string;
  }): WorkspaceBinding {
    const now = new Date().toISOString();
    const projectId = input.projectId?.trim() || input.workspaceId;
    const projectTitle = input.projectTitle?.trim() || `Workspace ${input.workspaceId}`;

    const data = this.readFile();
    const existing = data.bindings.find(b => b.workspaceId === input.workspaceId);
    const record: WorkspaceBinding = {
      workspaceId: input.workspaceId,
      projectId,
      projectTitle,
      satelliteUrl: input.satelliteUrl,
      status: 'active',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      const index = data.bindings.indexOf(existing);
      data.bindings[index] = record;
    } else {
      data.bindings.push(record);
    }

    this.writeFile(data);
    return record;
  }

  suspend(workspaceId: string): WorkspaceBinding | null {
    const data = this.readFile();
    const binding = data.bindings.find(b => b.workspaceId === workspaceId);
    if (!binding) return null;
    binding.status = 'suspended';
    binding.updatedAt = new Date().toISOString();
    this.writeFile(data);
    return binding;
  }

  get(workspaceId: string): WorkspaceBinding | null {
    return this.readFile().bindings.find(b => b.workspaceId === workspaceId) ?? null;
  }

  listActive(): WorkspaceBinding[] {
    return this.readFile().bindings.filter(b => b.status === 'active');
  }

  resolveProjectId(workspaceId: string | undefined, fallbackProjectId: string): string {
    if (!workspaceId) return fallbackProjectId;
    const binding = this.get(workspaceId);
    if (binding?.status === 'active') return binding.projectId;
    return fallbackProjectId;
  }

  private readFile(): BindingFileSchema {
    if (!fs.existsSync(this.filePath)) {
      return { bindings: [] };
    }
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as BindingFileSchema;
      if (!Array.isArray(parsed.bindings)) return { bindings: [] };
      return parsed;
    } catch {
      throw new Error(`Cannot read workspace bindings file: ${this.filePath}`);
    }
  }

  private writeFile(data: BindingFileSchema): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }
}