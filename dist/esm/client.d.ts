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
import { PushApi } from './core/push.js';
import { ElectricConfig, LoginResult, TokenSet } from './core/types.js';
export declare class ElectricOpenPlatformClient {
    private auth?;
    private router?;
    private config?;
    /** Domain API groups — populated by {@link configure}. */
    project: ProjectApi;
    box: BoxApi;
    channel: ChannelApi;
    control: ControlApi;
    alarm: AlarmApi;
    stats: StatsApi;
    scene: SceneApi;
    push: PushApi;
    private credentials;
    /**
     * Configures the plugin. Safe to call again (e.g. after the user switches
     * project) — previous timers are released and tokens for the old `appKey` are
     * left untouched on disk.
     */
    configure(config: ElectricConfig): Promise<void>;
    /** True once `configure()` succeeded. */
    get isConfigured(): boolean;
    /** Where tokens are persisted — useful on a diagnostics screen. */
    storageBackend(): Promise<string>;
    /** Headless login with the platform account (POST /oauth/authverify2.as). */
    login(username: string, password: string): Promise<LoginResult>;
    /** Redirect-flow: the URL to open in a browser for the platform's login page. */
    getAuthorizeUrl(options?: {
        state?: string;
    }): string;
    /**
     * Redirect-flow step 2: pass the full redirect URL (or the bare code) received
     * by your `redirectUri` endpoint.
     */
    handleRedirect(urlOrCode: string): Promise<TokenSet>;
    /** Renews the token now instead of waiting for the timer. */
    refreshToken(): Promise<TokenSet>;
    get currentToken(): TokenSet | null;
    logout(): Promise<void>;
    /**
     * Escape hatch for platform methods that are not (yet) wrapped, e.g. new
     * `GET_*` endpoints added after this release. Signs, retries and unwraps for
     * you, so prefer it over hand-rolling `fetch`.
     */
    invoke<T = unknown>(method: string, params?: Record<string, string | number | boolean | null | undefined>): Promise<T>;
    /** Current configuration with the secret masked. */
    describe(): Record<string, unknown>;
    /** Releases timers; call from `ngOnDestroy` / `useEffect` cleanup. */
    dispose(): void;
    private requireAuth;
    private requireRouter;
}
/** Default singleton instance. Also exported as the named `ElectricOpenPlatform`. */
export declare const ElectricOpenPlatform: ElectricOpenPlatformClient;
