import { TokenStore } from './storage.js';
import { ElectricConfig, TokenSet } from './types.js';
export declare class AuthManager {
    private config;
    private tokens;
    private inflight;
    private timer;
    private readonly store;
    private readonly logger?;
    constructor(store: TokenStore, config: ElectricConfig);
    /** Hydrates tokens persisted by a previous app session. */
    restore(): Promise<TokenSet | null>;
    get current(): TokenSet | null;
    /** The redirect-flow login URL, for opening in a browser / InAppBrowser. */
    getAuthorizeUrl(options?: {
        state?: string;
    }): string;
    /** Extracts `code` from a redirect URL such as `http://host/receive?code=abc`. */
    static extractCode(url: string): string | null;
    /** Step 1 of the headless flow: POST `/oauth/authverify2.as` for a temporary code. */
    fetchCode(credentials: {
        username: string;
        password: string;
    }): Promise<string>;
    /**
     * Steps 1+2 in one call: headless login with username/password, then store the token.
     * Concurrent calls share the same in-flight handshake.
     */
    loginWithPassword(username: string, password: string): Promise<TokenSet>;
    /** Step 2: exchange a code for an access token (`POST /oauth/token.as`). */
    exchangeCode(code: string): Promise<TokenSet>;
    private doExchangeCode;
    /**
     * Returns a usable access token, renewing it first when it is within the skew
     * window. Falls back to a full re-login when the refresh token is gone.
     */
    getAccessToken(credentials?: {
        username?: string;
        password?: string;
    }): Promise<string>;
    /** `POST /oauth/refresh.as` */
    refresh(): Promise<TokenSet>;
    private doRefresh;
    /** Invalidates the platform-side session? No such endpoint exists — clear locally. */
    logout(): Promise<void>;
    /**
     * Converts a platform "token invalid" answer into a fresh access token.
     *
     * Prefers the refresh token (no credential round-trip); falls back to a full
     * headless login when credentials were configured.
     */
    recover(credentials?: {
        username?: string;
        password?: string;
    }): Promise<string>;
    /** Called by the client after the platform answers with code `"2"`. */
    invalidate(): Promise<void>;
    dispose(): void;
    private absorb;
    private isExpired;
    /**
     * Proactively refreshes shortly before expiry so that a 60 s poller never
     * hits code `"2"`. Browsers throttle long timers, so the client *also* checks
     * lazily on every request — belt and braces.
     */
    private scheduleRefresh;
    private clearTimer;
    private emit;
}
