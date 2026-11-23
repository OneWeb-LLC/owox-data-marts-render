import {
  type ApproveMembershipRequestResult,
  type AuthResult,
  type CreateNewProjectResult,
  type GetProjectMembersOptions,
  IdpOperationNotSupportedError,
  type IdpProvider,
  type McpOAuthProjectMemberContext,
  type McpScope,
  type McpTokenPayload,
  type OAuthAuthorizationCode,
  type OAuthAuthorizationRequest,
  type OAuthJwksResult,
  type OAuthTokenExchangeRequest,
  type OAuthTokenExchangeResult,
  type Payload,
  type Project,
  type ProjectMember,
  type ProjectMemberInvitation,
  type ProjectMembershipRequest,
  type Projects,
  type RequestProjectAccessResult,
  type Role,
  RoleEnum,
  type UserProvisioningRequestAccessContext,
  type UserProvisioningSettings,
  type UserProvisioningSettingsUpdate,
} from '@owox/idp-protocol';
import type { Express, NextFunction, Request, Response } from 'express';
import type { JWTPayload } from 'jose';

import type { OneOsIdpConfig } from './config/load-one-os-config.js';
import { OneOsSessionStore } from './session/session-store.js';
import { readClaimPath, verifySupabaseAccessToken } from './supabase/verify-supabase-jwt.js';
import { signAccessToken, verifyAccessToken } from './tokens/access-token.js';
import {
  buildOwebConstellationSignInUrl,
  redeemOwebLaunchToken,
} from './ecosystem/redeem-launch-token.js';
import { ProjectMemberRegistry } from './workspace/project-member-registry.js';
import { WorkspaceBindingStore } from './workspace/workspace-binding-store.js';
import express from 'express';

const SESSION_COOKIE = 'one-os.session';

export class OneOsIdpProvider implements IdpProvider {
  private readonly sessions = new OneOsSessionStore();
  private readonly bindings: WorkspaceBindingStore;
  private readonly members: ProjectMemberRegistry;

  constructor(private readonly config: OneOsIdpConfig) {
    const bindingsPath = WorkspaceBindingStore.resolveDefaultPath(
      this.config.bindingsFilePath || undefined,
      this.config.baseUrl
    );
    this.bindings = new WorkspaceBindingStore(bindingsPath);
    this.members = new ProjectMemberRegistry(
      ProjectMemberRegistry.pathBesideBindings(bindingsPath)
    );
  }

  registerRoutes(app: Express): void {
    app.get('/auth/one-os/callback', (req, res) => {
      void this.handleCallback(req, res);
    });

    app.get('/auth/sso', (req, res) => {
      void this.handleSsoLaunch(req, res);
    });

    const internal = express.Router();
    internal.use(express.json());
    internal.post('/workspaces/activate', (req, res) => {
      if (!this.requireActivationAuth(req, res)) return;
      const body = req.body as {
        workspaceId?: string;
        projectId?: string;
        projectTitle?: string;
      };
      if (!body.workspaceId || typeof body.workspaceId !== 'string') {
        res.status(400).json({ error: 'workspaceId is required' });
        return;
      }
      const binding = this.bindings.activate({
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        projectTitle: body.projectTitle,
        satelliteUrl: this.config.baseUrl,
      });
      res.status(201).json(binding);
    });
    internal.get('/workspaces/:workspaceId/binding', (req, res) => {
      if (!this.requireActivationAuth(req, res)) return;
      const binding = this.bindings.get(req.params.workspaceId);
      if (!binding || binding.status !== 'active') {
        res.status(404).json({ error: 'No active binding' });
        return;
      }
      res.json(binding);
    });
    internal.delete('/workspaces/:workspaceId', (req, res) => {
      if (!this.requireActivationAuth(req, res)) return;
      const binding = this.bindings.suspend(req.params.workspaceId);
      if (!binding) {
        res.status(404).json({ error: 'Binding not found' });
        return;
      }
      res.json(binding);
    });
    app.use('/internal/one-os', internal);
  }

  async initialize(): Promise<void> {
    // No external connections; Supabase is validated per request.
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async shutdown(): Promise<void> {
    // In-memory sessions only.
  }

  async signInMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    if (this.config.ecosystemAppId) {
      const target = buildOwebConstellationSignInUrl(
        this.config.signInUrl,
        this.config.ecosystemAppId
      );
      return res.redirect(target);
    }

    const callback = new URL('/auth/one-os/callback', this.config.baseUrl).toString();
    const target = new URL(this.config.signInUrl);
    if (!target.searchParams.has('redirect_to') && !target.searchParams.has('next')) {
      target.searchParams.set('redirect_to', callback);
    }
    return res.redirect(target.toString());
  }

  async signUpMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void | Response> {
    return this.signInMiddleware(req, res, next);
  }

  async signOutMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (typeof sessionId === 'string') {
      this.sessions.delete(sessionId);
    }
    const isSecure = this.isSecureRequest(req);
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isSecure, sameSite: 'lax' });
    return res.redirect('/auth/sign-in');
  }

  async accessTokenMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void | Response> {
    const session = this.readSession(req);
    if (!session) {
      return res.status(401).json({ reason: 'no_session' });
    }

    const accessToken = await signAccessToken(
      session.payload,
      this.config.sessionSecret,
      this.config.accessTokenTtlSeconds
    );

    return res.json({
      accessToken,
      accessTokenExpiresIn: this.config.accessTokenTtlSeconds,
    });
  }

  async userApiMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<Response<Payload>> {
    const fromHeader = req.headers['x-owox-authorization'];
    const bearer =
      typeof fromHeader === 'string'
        ? fromHeader
        : typeof req.headers.authorization === 'string'
          ? req.headers.authorization
          : undefined;

    if (bearer) {
      const payload = await this.introspectToken(bearer);
      if (payload) return res.json(payload);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const session = this.readSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.json(session.payload);
  }

  async projectsApiMiddleware(
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<Response<Projects>> {
    const session = this.readSession(req);
    const token =
      typeof req.headers['x-owox-authorization'] === 'string'
        ? req.headers['x-owox-authorization']
        : undefined;
    const projects = await this.getProjects(token ?? (session ? 'session' : ''));
    return res.json(projects);
  }

  async getProjects(_accessToken: string): Promise<Projects> {
    const active = this.bindings.listActive();
    if (active.length === 0) {
      return [
        {
          id: this.config.defaultProjectId,
          title: this.config.projectTitle,
          status: 'active',
          roles: [this.config.defaultRole],
        },
      ];
    }
    return active.map(b => ({
      id: b.projectId,
      title: b.projectTitle,
      status: 'active' as const,
      roles: [this.config.defaultRole],
    }));
  }

  async getProjectForUser(_userId: string, projectId: string): Promise<Project> {
    const fromBinding = this.bindings.listActive().find(b => b.projectId === projectId);
    return {
      id: projectId,
      title:
        fromBinding?.projectTitle ??
        (projectId === this.config.defaultProjectId ? this.config.projectTitle : projectId),
      status: 'active',
    };
  }

  async introspectToken(token: string): Promise<Payload | null> {
    const normalized = this.normalizeBearer(token);
    const owoxPayload = await verifyAccessToken(normalized, this.config.sessionSecret);
    if (owoxPayload) {
      this.members.remember(owoxPayload);
      return owoxPayload;
    }

    try {
      const verified = await verifySupabaseAccessToken(
        normalized,
        this.config.supabaseUrl,
        this.config.supabaseJwtSecret
      );
      const payload = this.payloadFromSupabaseClaims(
        verified.userId,
        verified.email,
        verified.claims
      );
      this.members.remember(payload);
      return payload;
    } catch {
      return null;
    }
  }

  async parseToken(token: string): Promise<Payload | null> {
    return this.introspectToken(token);
  }

  async refreshToken(_refreshToken: string): Promise<AuthResult> {
    throw new IdpOperationNotSupportedError('refreshToken');
  }

  async revokeToken(_token: string): Promise<void> {
    // Access tokens are short-lived JWTs; session revoke happens on sign-out.
  }

  async issueAccessTokenForProjectMemberApiKey(
    apiKeyId: string,
    userId: string,
    projectId: string,
    role: Role | null,
    _readOnly: boolean
  ): Promise<AuthResult> {
    const roles = role ? [role] : [this.config.defaultRole];
    const payload: Payload = {
      userId,
      projectId,
      roles,
      authFlow: 'api_key',
      apiKeyId,
    };
    const accessToken = await signAccessToken(
      payload,
      this.config.sessionSecret,
      this.config.accessTokenTtlSeconds
    );
    return { accessToken, accessTokenExpiresIn: this.config.accessTokenTtlSeconds };
  }

  async issueAccessTokenForPluginRuntime(
    pluginId: string,
    installationId: string,
    userId: string,
    projectId: string
  ): Promise<AuthResult> {
    const payload: Payload = {
      userId,
      projectId,
      roles: [this.config.defaultRole],
      authFlow: 'plugin',
      pluginId,
      installationId,
    };
    const accessToken = await signAccessToken(
      payload,
      this.config.sessionSecret,
      this.config.accessTokenTtlSeconds
    );
    return { accessToken, accessTokenExpiresIn: this.config.accessTokenTtlSeconds };
  }

  async createMcpOAuthAuthorizationCode(
    _request: OAuthAuthorizationRequest,
    _projectMember: McpOAuthProjectMemberContext
  ): Promise<OAuthAuthorizationCode> {
    throw new IdpOperationNotSupportedError('createMcpOAuthAuthorizationCode');
  }

  async exchangeMcpOAuthToken(
    _request: OAuthTokenExchangeRequest
  ): Promise<OAuthTokenExchangeResult> {
    throw new IdpOperationNotSupportedError('exchangeMcpOAuthToken');
  }

  async verifyMcpAccessToken(
    _token: string,
    _resource: string,
    _requiredScopes: McpScope[]
  ): Promise<McpTokenPayload | null> {
    return null;
  }

  async getMcpOAuthJwks(): Promise<OAuthJwksResult> {
    throw new IdpOperationNotSupportedError('getMcpOAuthJwks');
  }

  async getProjectMembers(
    projectId: string,
    _options?: GetProjectMembersOptions
  ): Promise<ProjectMember[]> {
    return this.members.list(projectId);
  }

  async inviteMember(
    _projectId: string,
    _email: string,
    _role: Role,
    _actorUserId: string
  ): Promise<ProjectMemberInvitation> {
    throw new IdpOperationNotSupportedError('inviteMember');
  }

  async removeMember(_projectId: string, _userId: string, _actorUserId: string): Promise<void> {
    throw new IdpOperationNotSupportedError('removeMember');
  }

  async changeMemberRole(
    _projectId: string,
    _userId: string,
    _newRole: Role,
    _actorUserId: string
  ): Promise<void> {
    throw new IdpOperationNotSupportedError('changeMemberRole');
  }

  async getUserProvisioningSettings(
    _projectId: string,
    _actorUserId: string
  ): Promise<UserProvisioningSettings> {
    return { isApplicable: false, organization: null, settings: null };
  }

  async updateUserProvisioningSettings(
    _projectId: string,
    _actorUserId: string,
    _settings: UserProvisioningSettingsUpdate
  ): Promise<UserProvisioningSettings> {
    throw new IdpOperationNotSupportedError('updateUserProvisioningSettings');
  }

  async listMembershipRequests(
    _projectId: string,
    _actorUserId: string,
    _options?: { forceFresh?: boolean }
  ): Promise<ProjectMembershipRequest[]> {
    return [];
  }

  async approveMembershipRequest(
    _projectId: string,
    _requestId: string,
    _role: Role,
    _actorUserId: string
  ): Promise<ApproveMembershipRequestResult> {
    throw new IdpOperationNotSupportedError('approveMembershipRequest');
  }

  async declineMembershipRequest(
    _projectId: string,
    _requestId: string,
    _actorUserId: string
  ): Promise<void> {
    throw new IdpOperationNotSupportedError('declineMembershipRequest');
  }

  async getUserProvisioningRequestAccessContext(
    _userId: string,
    _projectId: string
  ): Promise<UserProvisioningRequestAccessContext> {
    throw new IdpOperationNotSupportedError('getUserProvisioningRequestAccessContext');
  }

  async requestProjectAccess(
    _userId: string,
    _projectId: string,
    _role: Role
  ): Promise<RequestProjectAccessResult> {
    throw new IdpOperationNotSupportedError('requestProjectAccess');
  }

  async createNewProject(_userId: string, _integration: string): Promise<CreateNewProjectResult> {
    throw new IdpOperationNotSupportedError('createNewProject');
  }

  private async handleSsoLaunch(req: Request, res: Response): Promise<void> {
    const appId = this.config.ecosystemAppId;
    if (!appId) {
      res.status(503).send('Constellation SSO is not configured (IDP_ONE_OS_ECOSYSTEM_APP_ID)');
      return;
    }

    const launchToken =
      (typeof req.query.launch_token === 'string' && req.query.launch_token) ||
      (typeof req.query.token === 'string' && req.query.token);

    if (!launchToken) {
      res.status(400).send('Missing launch_token');
      return;
    }

    try {
      const redeemed = await redeemOwebLaunchToken(
        this.config.owebControlPlaneUrl,
        appId,
        launchToken
      );
      await this.establishSessionFromAccessToken(req, res, redeemed.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'SSO redeem failed';
      res.status(401).send(message);
    }
  }

  private async handleCallback(req: Request, res: Response): Promise<void> {
    const token =
      (typeof req.query.access_token === 'string' && req.query.access_token) ||
      (typeof req.query.token === 'string' && req.query.token) ||
      (typeof req.body?.access_token === 'string' && req.body.access_token);

    if (!token) {
      res.status(400).send('Missing Supabase access_token on callback');
      return;
    }

    try {
      await this.establishSessionFromAccessToken(req, res, token);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      res.status(401).send(message);
    }
  }

  private async establishSessionFromAccessToken(
    req: Request,
    res: Response,
    accessToken: string
  ): Promise<void> {
    const verified = await verifySupabaseAccessToken(
      accessToken,
      this.config.supabaseUrl,
      this.config.supabaseJwtSecret
    );
    const payload = this.payloadFromSupabaseClaims(
      verified.userId,
      verified.email,
      verified.claims
    );
    this.members.remember(payload);
    const sessionId = this.sessions.create(payload);
    const isSecure = this.isSecureRequest(req);
    res.cookie(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: this.config.sessionCookieMaxAgeMs,
    });

    const redirect =
      typeof req.query.redirect === 'string' && req.query.redirect.startsWith('/')
        ? req.query.redirect
        : '/';
    res.redirect(redirect);
  }

  private payloadFromSupabaseClaims(
    userId: string,
    email: string | undefined,
    claims: JWTPayload
  ): Payload {
    const workspaceRaw = readClaimPath(claims, this.config.workspaceClaimPath);
    const workspaceId = typeof workspaceRaw === 'string' ? workspaceRaw : undefined;
    const projectId = this.resolveProjectId(workspaceId);
    const binding = workspaceId ? this.bindings.get(workspaceId) : null;
    const projectTitle =
      binding?.status === 'active'
        ? binding.projectTitle
        : workspaceId && this.config.workspaceProjectMap[workspaceId]
          ? this.config.projectTitle
          : this.config.projectTitle;

    const roleRaw = readClaimPath(claims, this.config.roleClaimPath);
    let role = this.config.defaultRole;
    if (typeof roleRaw === 'string') {
      const parsed = RoleEnum.safeParse(roleRaw.toLowerCase());
      if (parsed.success) role = parsed.data;
    }
    if (email && this.config.adminEmails.has(email.toLowerCase())) {
      role = 'admin';
    }

    const fullName =
      typeof claims.user_metadata === 'object' &&
      claims.user_metadata &&
      typeof (claims.user_metadata as Record<string, unknown>).full_name === 'string'
        ? ((claims.user_metadata as Record<string, unknown>).full_name as string)
        : email;

    return {
      userId,
      projectId,
      email,
      fullName,
      roles: [role],
      projectTitle,
      signinProvider: 'one-os',
    };
  }

  private resolveProjectId(workspaceId: string | undefined): string {
    if (workspaceId) {
      const fromStore = this.bindings.resolveProjectId(workspaceId, '');
      if (fromStore) return fromStore;
      const fromEnv = this.config.workspaceProjectMap[workspaceId];
      if (fromEnv) return fromEnv;
    }
    return this.config.defaultProjectId;
  }

  private requireActivationAuth(req: Request, res: Response): boolean {
    if (!this.config.activationSecret) {
      res.status(503).json({ error: 'Workspace activation is not configured' });
      return false;
    }
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    const token = header.slice('Bearer '.length).trim();
    if (token !== this.config.activationSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  }

  private readSession(req: Request): StoredSessionView | null {
    const sessionId = req.cookies?.[SESSION_COOKIE];
    if (typeof sessionId !== 'string') return null;
    const stored = this.sessions.get(sessionId);
    return stored ? { payload: stored.payload } : null;
  }

  private isSecureRequest(req: Request): boolean {
    return (
      req.protocol !== 'http' && !(req.hostname === 'localhost' || req.hostname === '127.0.0.1')
    );
  }

  private normalizeBearer(rawToken: string): string {
    const token = rawToken.trim();
    return token.toLowerCase().startsWith('bearer ') ? token.slice(7).trim() : token;
  }
}

interface StoredSessionView {
  payload: Payload;
}
