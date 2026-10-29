"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
/**
 * OAuth2 lifecycle for the open platform.
 *
 * Two ways to obtain a token, both documented:
 *  1. Redirect flow (`/oauth/authorize.as?client_id=…&response_type=code`) for a
 *     full web-login experience — the host app receives `?code=` and calls
 *     {@link AuthManager.exchangeCode}.
 *  2. Headless flow (`POST /oauth/authverify2.as` with `uname`/`passwd`) — used
 *     by the plugin's `login()` convenience method.
 *
 * Once a token exists it is kept warm with the refresh endpoint, so a background
 * poller never has to handle expiry itself.
 */
const errors_js_1 = require("./errors.js");
const http_js_1 = require("./http.js");
const sign_js_1 = require("./sign.js");
const types_js_1 = require("./types.js");
const MIN_EXPIRES_IN_SECONDS = 60;
class AuthManager {
    constructor(store, config) {
        this.tokens = null;
        this.inflight = null;
        this.timer = null;
        this.store = store;
        this.logger = config.logger;
        this.config = {
            appKey: config.appKey,
            appSecret: config.appSecret,
            redirectUri: config.redirectUri,
            baseUrl: (config.baseUrl ?? types_js_1.DEFAULT_BASE_URL).replace(/\/+$/, ''),
            timeoutMs: config.timeoutMs ?? 20000,
            tokenRefreshSkewMs: config.tokenRefreshSkewMs ?? 60000,
        };
    }
    /** Hydrates tokens persisted by a previous app session. */
    async restore() {
        const saved = await this.store.readTokens();
        if (saved && saved.accessToken) {
            this.tokens = saved;
            if (!this.isExpired(saved))
                this.scheduleRefresh();
            else
                this.tokens = null;
            return this.tokens;
        }
        return null;
    }
    get current() {
        return this.tokens;
    }
    /** The redirect-flow login URL, for opening in a browser / InAppBrowser. */
    getAuthorizeUrl(options = {}) {
        const qs = (0, sign_js_1.encodeForm)({
            client_id: this.config.appKey,
            response_type: 'code',
            redirect_uri: this.config.redirectUri,
            ...(options.state ? { state: options.state } : {}),
        });
        return `${this.config.baseUrl}/oauth/authorize.as?${qs}`;
    }
    /** Extracts `code` from a redirect URL such as `http://host/receive?code=abc`. */
    static extractCode(url) {
        const match = /[?&#]code=([^&#]+)/.exec(url);
        return match ? decodeURIComponent(match[1]) : null;
    }
    /** Step 1 of the headless flow: POST `/oauth/authverify2.as` for a temporary code. */
    async fetchCode(credentials) {
        const body = (0, sign_js_1.encodeForm)({
            response_type: 'code',
            client_id: this.config.appKey,
            redirect_uri: this.config.redirectUri,
            uname: credentials.username,
            passwd: credentials.password,
        });
        const res = await (0, http_js_1.postForm)({
            url: `${this.config.baseUrl}/oauth/authverify2.as`,
            body,
            timeoutMs: this.config.timeoutMs,
        });
        const payload = res.data;
        if (!payload || typeof payload !== 'object' || !payload.code || String(payload.success) !== 'true') {
            throw new errors_js_1.ElectricOpenPlatformError(errors_js_1.TransportCodes.OAUTH, `获取授权码失败：${(payload && payload.message) || '账号或密码不正确'}`, { details: res.data });
        }
        this.logger?.({ type: 'token', message: '已获取临时授权码 code', at: new Date().toISOString() });
        return payload.code;
    }
    /**
     * Steps 1+2 in one call: headless login with username/password, then store the token.
     * Concurrent calls share the same in-flight handshake.
     */
    async loginWithPassword(username, password) {
        const code = await this.fetchCode({ username, password });
        return this.exchangeCode(code);
    }
    /** Step 2: exchange a code for an access token (`POST /oauth/token.as`). */
    async exchangeCode(code) {
        if (this.inflight)
            return this.inflight;
        this.inflight = this.doExchangeCode(code).finally(() => {
            this.inflight = null;
        });
        return this.inflight;
    }
    async doExchangeCode(code) {
        const clientSecret = (0, sign_js_1.signAuthCodeSecret)({
            appKey: this.config.appKey,
            appSecret: this.config.appSecret,
            redirectUri: this.config.redirectUri,
            code,
        });
        const body = (0, sign_js_1.encodeForm)({
            client_id: this.config.appKey,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            redirect_uri: this.config.redirectUri,
            code,
        });
        const res = await (0, http_js_1.postForm)({
            url: `${this.config.baseUrl}/oauth/token.as`,
            body,
            timeoutMs: this.config.timeoutMs,
        });
        return this.absorb(res.data, 'accessToken');
    }
    /**
     * Returns a usable access token, renewing it first when it is within the skew
     * window. Falls back to a full re-login when the refresh token is gone.
     */
    async getAccessToken(credentials) {
        if (this.tokens && !this.isExpired(this.tokens))
            return this.tokens.accessToken;
        if (this.inflight)
            return (await this.inflight).accessToken;
        if (this.tokens?.refreshToken) {
            try {
                return (await this.refresh()).accessToken;
            }
            catch (err) {
                // A dead refresh token is indistinguishable from an expired session;
                // drop it and fall through to a full login when credentials exist.
                this.emit('error', `刷新 accessToken 失败：${err.message}`);
                this.tokens = null;
            }
        }
        if (credentials?.username && credentials.password) {
            return (await this.loginWithPassword(credentials.username, credentials.password)).accessToken;
        }
        throw new errors_js_1.ElectricOpenPlatformError(errors_js_1.TransportCodes.NOT_CONFIGURED, 'accessToken 已过期，请重新登录');
    }
    /** `POST /oauth/refresh.as` */
    async refresh() {
        if (this.inflight)
            return this.inflight;
        this.inflight = this.doRefresh().finally(() => {
            this.inflight = null;
        });
        return this.inflight;
    }
    async doRefresh() {
        const refreshToken = this.tokens?.refreshToken;
        if (!refreshToken) {
            throw new errors_js_1.ElectricOpenPlatformError(errors_js_1.TransportCodes.OAUTH, '缺少 refreshToken，无法刷新');
        }
        const clientSecret = (0, sign_js_1.signRefreshSecret)({
            appKey: this.config.appKey,
            appSecret: this.config.appSecret,
            redirectUri: this.config.redirectUri,
            refreshToken,
        });
        const body = (0, sign_js_1.encodeForm)({
            client_id: this.config.appKey,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            redirect_uri: this.config.redirectUri,
            refresh_token: refreshToken,
        });
        const res = await (0, http_js_1.postForm)({
            url: `${this.config.baseUrl}/oauth/refresh.as`,
            body,
            timeoutMs: this.config.timeoutMs,
        });
        return this.absorb(res.data, 'refresh');
    }
    /** Invalidates the platform-side session? No such endpoint exists — clear locally. */
    async logout() {
        this.tokens = null;
        this.clearTimer();
        await this.store.clear();
        this.emit('token', '已清除本地授权');
    }
    /**
     * Converts a platform "token invalid" answer into a fresh access token.
     *
     * Prefers the refresh token (no credential round-trip); falls back to a full
     * headless login when credentials were configured.
     */
    async recover(credentials) {
        if (this.tokens?.refreshToken) {
            try {
                return (await this.refresh()).accessToken;
            }
            catch (err) {
                this.emit('error', `refresh 失败，改用账号密码重新登录：${err.message}`);
            }
        }
        if (credentials?.username && credentials.password) {
            return (await this.loginWithPassword(credentials.username, credentials.password)).accessToken;
        }
        await this.invalidate();
        throw new errors_js_1.ElectricOpenPlatformError(errors_js_1.TransportCodes.NOT_CONFIGURED, '会话已失效，请重新登录');
    }
    /** Called by the client after the platform answers with code `"2"`. */
    async invalidate() {
        this.tokens = null;
        this.clearTimer();
        await this.store.clear();
    }
    dispose() {
        this.clearTimer();
    }
    absorb(payload, origin) {
        const envelope = payload;
        if (!envelope || typeof envelope !== 'object' || !envelope.data) {
            throw new errors_js_1.ElectricOpenPlatformError(errors_js_1.TransportCodes.OAUTH, '授权响应格式异常', { details: payload });
        }
        if (envelope.code !== undefined && envelope.code !== errors_js_1.PlatformCodes.OK) {
            throw new errors_js_1.ElectricOpenPlatformError(envelope.code, envelope.message || '授权失败', {
                details: payload,
            });
        }
        const d = envelope.data;
        const accessToken = d.accessToken ?? d.access_token;
        const refreshToken = d.refreshToken ?? d.refresh_token ?? '';
        const rawExpires = d.expiresIn ?? d.expires_in;
        const expiresIn = Number(rawExpires ?? 3600);
        if (!accessToken) {
            throw new errors_js_1.ElectricOpenPlatformError(errors_js_1.TransportCodes.OAUTH, '授权响应中缺少 accessToken', {
                details: payload,
            });
        }
        const ttlSeconds = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600;
        const tokens = {
            accessToken,
            refreshToken,
            tokenType: (d.tokenType ?? 'BEARER').toUpperCase(),
            expiresAt: Date.now() + Math.max(ttlSeconds, MIN_EXPIRES_IN_SECONDS) * 1000,
        };
        this.tokens = tokens;
        this.scheduleRefresh();
        void this.store.writeTokens(tokens);
        this.emit('token', origin === 'refresh' ? 'accessToken 已刷新' : 'accessToken 已获取', {
            expiresIn: ttlSeconds,
        });
        return tokens;
    }
    isExpired(tokens) {
        return tokens.expiresAt - this.config.tokenRefreshSkewMs <= Date.now();
    }
    /**
     * Proactively refreshes shortly before expiry so that a 60 s poller never
     * hits code `"2"`. Browsers throttle long timers, so the client *also* checks
     * lazily on every request — belt and braces.
     */
    scheduleRefresh() {
        this.clearTimer();
        if (!this.tokens?.refreshToken)
            return;
        const delay = this.tokens.expiresAt - this.config.tokenRefreshSkewMs - Date.now();
        if (delay <= 0 || delay > 2 ** 31 - 1)
            return;
        this.timer = setTimeout(() => {
            this.refresh().catch((err) => {
                this.emit('error', `定时刷新失败：${err.message}`);
            });
        }, delay);
        // Node/SSR safety: an unref'd timer must not keep the test process alive.
        this.timer.unref?.();
    }
    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
    emit(type, message, detail) {
        this.logger?.({ type, message, detail, at: new Date().toISOString() });
    }
}
exports.AuthManager = AuthManager;
//# sourceMappingURL=auth.js.map