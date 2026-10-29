/**
 * `POST /invoke/router.as` client.
 *
 * Responsibilities:
 *  - sign every request (MD5 over sorted values + appSecret);
 *  - inject a valid access token, transparently refreshing it once per call when
 *    the platform answers `code: "2"` (token expired);
 *  - unwrap the `{ code, message, data }` envelope into plain data or throw an
 *    {@link ElectricOpenPlatformError} carrying the platform code.
 */
import { AuthManager } from './auth.js';
import { ParamValue } from './sign.js';
import { ElectricConfig } from './types.js';
export interface CallOptions {
    /** Overrides the configured default project code. */
    projectCode?: string;
    params?: Record<string, ParamValue>;
    timeoutMs?: number;
    signal?: AbortSignal;
    /** Internal: prevents an endless refresh → retry → refresh loop. */
    _retried?: boolean;
}
export declare class RouterClient {
    private readonly config;
    private readonly auth;
    private readonly logger?;
    private readonly credentials;
    /** Once any signed call succeeds we can attribute 签名 errors to provisioning. */
    private hasAnySuccess;
    constructor(config: ElectricConfig, auth: AuthManager, credentials: () => {
        username?: string;
        password?: string;
    });
    /**
     * Calls one platform method and returns its `data` payload.
     *
     * @throws ElectricOpenPlatformError for transport failures and non-zero codes.
     */
    call<T>(method: string, options?: CallOptions): Promise<T>;
    /** Convenience: call a method that returns a paginated `data` object. */
    callPaged<T>(method: string, options?: CallOptions): Promise<T>;
    private renewToken;
    private emit;
}
