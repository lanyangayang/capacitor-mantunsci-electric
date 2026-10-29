/**
 * The plugin facade.
 *
 * Everything is composed here so the public surface stays a single object:
 *
 * ```ts
 * import { ElectricOpenPlatform } from '@mantunsci/capacitor-electric-open-platform';
 *
 * await ElectricOpenPlatform.configure({ appKey, appSecret, redirectUri, projectCode });
 * await ElectricOpenPlatform.login('yfdq01', '******');
 * const boxes = await ElectricOpenPlatform.box.list();
 * ```
 */
import { AlarmApi, BoxApi, ChannelApi, ControlApi, ProjectApi, SceneApi, StatsApi } from './core/api.js';
import { AuthManager } from './core/auth.js';
import { PushApi } from './core/push.js';
import { RouterClient } from './core/router.js';
import { resolveBackend, TokenStore } from './core/storage.js';
import { ElectricConfig, LoginResult, TokenSet } from './core/types.js';

export class ElectricOpenPlatformClient {
  private auth?: AuthManager;
  private router?: RouterClient;
  private config?: ElectricConfig;

  /** Domain API groups — populated by {@link configure}. */
  project!: ProjectApi;
  box!: BoxApi;
  channel!: ChannelApi;
  control!: ControlApi;
  alarm!: AlarmApi;
  stats!: StatsApi;
  scene!: SceneApi;
  push!: PushApi;

  private credentials: { username?: string; password?: string } = {};

  /**
   * Configures the plugin. Safe to call again (e.g. after the user switches
   * project) — previous timers are released and tokens for the old `appKey` are
   * left untouched on disk.
   */
  async configure(config: ElectricConfig): Promise<void> {
    assertConfig(config);

    this.dispose();
    this.config = config;
    this.credentials = { username: config.username, password: config.password };

    const backend = await resolveBackend(config.storage ?? 'auto');
    const store = new TokenStore(backend, config.appKey);
    const auth = new AuthManager(store, config);
    const router = new RouterClient(config, auth, () => this.credentials);

    this.auth = auth;
    this.router = router;

    this.project = new ProjectApi(router);
    this.box = new BoxApi(router);
    this.channel = new ChannelApi(router);
    this.control = new ControlApi(router);
    this.alarm = new AlarmApi(router);
    this.stats = new StatsApi(router);
    this.scene = new SceneApi(router);
    this.push = new PushApi(router);

    await auth.restore();
  }

  /** True once `configure()` succeeded. */
  get isConfigured(): boolean {
    return !!this.router;
  }

  /** Where tokens are persisted — useful on a diagnostics screen. */
  async storageBackend(): Promise<string> {
    const mode = this.config?.storage ?? 'auto';
    return (await resolveBackend(mode)).name;
  }

  // --------------------------------------------------------------------- auth

  /** Headless login with the platform account (POST /oauth/authverify2.as). */
  async login(username: string, password: string): Promise<LoginResult> {
    const auth = this.requireAuth();
    this.credentials = { username, password };
    const code = await auth.fetchCode({ username, password });
    const tokens = await auth.exchangeCode(code);
    return { success: true, code, expiresIn: secondsUntil(tokens.expiresAt), expiresAt: tokens.expiresAt };
  }

  /** Redirect-flow: the URL to open in a browser for the platform's login page. */
  getAuthorizeUrl(options: { state?: string } = {}): string {
    return this.requireAuth().getAuthorizeUrl(options);
  }

  /**
   * Redirect-flow step 2: pass the full redirect URL (or the bare code) received
   * by your `redirectUri` endpoint.
   */
  async handleRedirect(urlOrCode: string): Promise<TokenSet> {
    const auth = this.requireAuth();
    const code = AuthManager.extractCode(urlOrCode) ?? urlOrCode;
    return auth.exchangeCode(code);
  }

  /** Renews the token now instead of waiting for the timer. */
  async refreshToken(): Promise<TokenSet> {
    return this.requireAuth().refresh();
  }

  get currentToken(): TokenSet | null {
    return this.auth?.current ?? null;
  }

  async logout(): Promise<void> {
    this.credentials = {};
    this.config = this.config ? { ...this.config, username: undefined, password: undefined } : this.config;
    await this.auth?.logout();
  }

  /**
   * Escape hatch for platform methods that are not (yet) wrapped, e.g. new
   * `GET_*` endpoints added after this release. Signs, retries and unwraps for
   * you, so prefer it over hand-rolling `fetch`.
   */
  async invoke<T = unknown>(method: string, params: Record<string, string | number | boolean | null | undefined> = {}): Promise<T> {
    return this.requireRouter().call<T>(method, { params });
  }

  /** Current configuration with the secret masked. */
  describe(): Record<string, unknown> {
    const c = this.config;
    if (!c) return { configured: false };
    return {
      configured: true,
      appKey: c.appKey,
      appSecret: c.appSecret ? `****${c.appSecret.slice(-4)}` : '',
      redirectUri: c.redirectUri,
      baseUrl: c.baseUrl ?? 'https://open.snd02.com',
      projectCode: c.projectCode,
      storage: c.storage ?? 'auto',
      token: this.auth?.current
        ? { ...this.auth.current, accessToken: mask(this.auth.current.accessToken) }
        : null,
    };
  }

  /** Releases timers; call from `ngOnDestroy` / `useEffect` cleanup. */
  dispose(): void {
    this.auth?.dispose();
    this.auth = undefined;
    this.router = undefined;
  }

  private requireAuth(): AuthManager {
    if (!this.auth) throw new Error('插件尚未初始化，请先调用 configure({ appKey, appSecret, redirectUri })');
    return this.auth;
  }

  private requireRouter(): RouterClient {
    if (!this.router) throw new Error('插件尚未初始化，请先调用 configure()');
    return this.router;
  }
}

function assertConfig(config: ElectricConfig): void {
  const missing: string[] = [];
  if (!config.appKey) missing.push('appKey');
  if (!config.appSecret) missing.push('appSecret');
  if (!config.redirectUri) missing.push('redirectUri');
  if (missing.length) throw new Error(`缺少必填配置：${missing.join(', ')}`);
  if (config.redirectUri && !/^https?:\/\//i.test(config.redirectUri)) {
    throw new Error('redirectUri 必须是 http(s) 绝对地址（会参与签名，需与平台登记一致）');
  }
}

function secondsUntil(epochMs: number): number {
  return Math.max(0, Math.round((epochMs - Date.now()) / 1000));
}

function mask(token: string): string {
  return token.length <= 8 ? '****' : `${token.slice(0, 6)}…${token.slice(-4)}`;
}

/** Default singleton instance. Also exported as the named `ElectricOpenPlatform`. */
export const ElectricOpenPlatform = new ElectricOpenPlatformClient();
