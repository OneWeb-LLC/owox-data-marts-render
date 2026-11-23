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

const SESSION_COOKIE = 'one-os.session';

export class OneOsIdpProvider implements IdpProvider {
  private readonly sessions = new OneOsSessionStore();

  constructor(private readonly config: OneOsIdpConfig) {}

  registerRoutes(app: Express): void {
    app.get('/auth/one-os/callback', (req, res) => {
      void this.handleCallback(req, res);
    });
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

  async signInMiddleware(req: Request, res: Response, _next: NextFunction): Promise<void | Response> {
    const callback = new URL('/auth/one-os/callback', this.config.baseUrl).toString();
    const target = new URL(this.config.signInUrl);
    if (!target.searchParams.has('redirect_to') && !target.searchParams.has('next')) {
      target.searchParams.set('redirect_to', callback);
    }
    return res.redirect(target.toString());
  }

  async signUpMiddleware(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
    return this.signInMiddleware(req, res, next);
  }

  async signOutMiddleware(req: Request, res: Response, _next: NextFunction): Promise<void | Response> {
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
    return [
      {
        id: this.config.defaultProjectId,
        title: this.config.projectTitle,
        status: 'active',
        roles: ['editor'],
      },
    ];
  }

  async getProjectForUser(_userId: string, projectId: string): Promise<Project> {
    return {
      id: projectId,
      title: projectId === this.config.defaultProjectId ? this.config.projectTitle : projectId,
      status: 'active',
    };
  }

  async introspectToken(token: string): Promise<Payload | null> {
    const normalized = this.normalizeBearer(token);
    const owoxPayload = await verifyAccessToken(normalized, this.config.sessionSecret);
    if (owoxPayload) return owoxPayload;

    try {
      const verified = await verifySupabaseAccessToken(
        normalized,
        this.config.supabaseUrl,
        this.config.supabaseJwtSecret
      );
      return this.payloadFromSupabaseClaims(verified.userId, verified.email, verified.claims);
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
    _projectId: string,
    _options?: GetProjectMembersOptions
  ): Promise<ProjectMember[]> {
    return [];
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
      const verified = await verifySupabaseAccessToken(
        token,
        this.config.supabaseUrl,
        this.config.supabaseJwtSecret
      );
      const payload = this.payloadFromSupabaseClaims(
        verified.userId,
        verified.email,
        verified.claims
      );
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      res.status(401).send(message);
    }
  }

  private payloadFromSupabaseClaims(
    userId: string,
    email: string | undefined,
    claims: JWTPayload
  ): Payload {
    const workspaceRaw = readClaimPath(claims, this.config.workspaceClaimPath);
    const workspaceId = typeof workspaceRaw === 'string' ? workspaceRaw : undefined;
    const projectId =
      (workspaceId && this.config.workspaceProjectMap[workspaceId]) ??
      this.config.defaultProjectId;

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
      projectTitle: this.config.projectTitle,
      signinProvider: 'one-os',
    };
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