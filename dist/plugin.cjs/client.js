"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElectricOpenPlatform = exports.ElectricOpenPlatformClient = void 0;
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
const api_js_1 = require("./core/api.js");
const auth_js_1 = require("./core/auth.js");
const push_js_1 = require("./core/push.js");
const router_js_1 = require("./core/router.js");
const storage_js_1 = require("./core/storage.js");
class ElectricOpenPlatformClient {
    constructor() {
        this.credentials = {};
    }
    /**
     * Configures the plugin. Safe to call again (e.g. after the user switches
     * project) — previous timers are released and tokens for the old `appKey` are
     * left untouched on disk.
     */
    async configure(config) {
        assertConfig(config);
        this.dispose();
        this.config = config;
        this.credentials = { username: config.username, password: config.password };
        const backend = await (0, storage_js_1.resolveBackend)(config.storage ?? 'auto');
        const store = new storage_js_1.TokenStore(backend, config.appKey);
        const auth = new auth_js_1.AuthManager(store, config);
        const router = new router_js_1.RouterClient(config, auth, () => this.credentials);
        this.auth = auth;
        this.router = router;
        this.project = new api_js_1.ProjectApi(router);
        this.box = new api_js_1.BoxApi(router);
        this.channel = new api_js_1.ChannelApi(router);
        this.control = new api_js_1.ControlApi(router);
        this.alarm = new api_js_1.AlarmApi(router);
        this.stats = new api_js_1.StatsApi(router);
        this.scene = new api_js_1.SceneApi(router);
        this.push = new push_js_1.PushApi(router);
        await auth.restore();
    }
    /** True once `configure()` succeeded. */
    get isConfigured() {
        return !!this.router;
    }
    /** Where tokens are persisted — useful on a diagnostics screen. */
    async storageBackend() {
        const mode = this.config?.storage ?? 'auto';
        return (await (0, storage_js_1.resolveBackend)(mode)).name;
    }
    // --------------------------------------------------------------------- auth
    /** Headless login with the platform account (POST /oauth/authverify2.as). */
    async login(username, password) {
        const auth = this.requireAuth();
        this.credentials = { username, password };
        const code = await auth.fetchCode({ username, password });
        const tokens = await auth.exchangeCode(code);
        return { success: true, code, expiresIn: secondsUntil(tokens.expiresAt), expiresAt: tokens.expiresAt };
    }
    /** Redirect-flow: the URL to open in a browser for the platform's login page. */
    getAuthorizeUrl(options = {}) {
        return this.requireAuth().getAuthorizeUrl(options);
    }
    /**
     * Redirect-flow step 2: pass the full redirect URL (or the bare code) received
     * by your `redirectUri` endpoint.
     */
    async handleRedirect(urlOrCode) {
        const auth = this.requireAuth();
        const code = auth_js_1.AuthManager.extractCode(urlOrCode) ?? urlOrCode;
        return auth.exchangeCode(code);
    }
    /** Renews the token now instead of waiting for the timer. */
    async refreshToken() {
        return this.requireAuth().refresh();
    }
    get currentToken() {
        return this.auth?.current ?? null;
    }
    async logout() {
        this.credentials = {};
        this.config = this.config ? { ...this.config, username: undefined, password: undefined } : this.config;
        await this.auth?.logout();
    }
    /**
     * Escape hatch for platform methods that are not (yet) wrapped, e.g. new
     * `GET_*` endpoints added after this release. Signs, retries and unwraps for
     * you, so prefer it over hand-rolling `fetch`.
     */
    async invoke(method, params = {}) {
        return this.requireRouter().call(method, { params });
    }
    /** Current configuration with the secret masked. */
    describe() {
        const c = this.config;
        if (!c)
            return { configured: false };
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
    dispose() {
        this.auth?.dispose();
        this.auth = undefined;
        this.router = undefined;
    }
    requireAuth() {
        if (!this.auth)
            throw new Error('插件尚未初始化，请先调用 configure({ appKey, appSecret, redirectUri })');
        return this.auth;
    }
    requireRouter() {
        if (!this.router)
            throw new Error('插件尚未初始化，请先调用 configure()');
        return this.router;
    }
}
exports.ElectricOpenPlatformClient = ElectricOpenPlatformClient;
function assertConfig(config) {
    const missing = [];
    if (!config.appKey)
        missing.push('appKey');
    if (!config.appSecret)
        missing.push('appSecret');
    if (!config.redirectUri)
        missing.push('redirectUri');
    if (missing.length)
        throw new Error(`缺少必填配置：${missing.join(', ')}`);
    if (config.redirectUri && !/^https?:\/\//i.test(config.redirectUri)) {
        throw new Error('redirectUri 必须是 http(s) 绝对地址（会参与签名，需与平台登记一致）');
    }
}
function secondsUntil(epochMs) {
    return Math.max(0, Math.round((epochMs - Date.now()) / 1000));
}
function mask(token) {
    return token.length <= 8 ? '****' : `${token.slice(0, 6)}…${token.slice(-4)}`;
}
/** Default singleton instance. Also exported as the named `ElectricOpenPlatform`. */
exports.ElectricOpenPlatform = new ElectricOpenPlatformClient();
//# sourceMappingURL=client.js.map