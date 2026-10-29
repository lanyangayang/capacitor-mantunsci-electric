/**
 * Error model for the Mtsci (snd02) open platform.
 *
 * Every failure — transport, OAuth or business return code — surfaces as an
 * `ElectricOpenPlatformError` so callers can branch on `code` instead of
 * parsing `message` strings.
 */
export declare const PlatformCodes: {
    readonly OK: "0";
    readonly NOT_LOGGED_IN: "-1";
    readonly FAILED: "1";
    readonly TOKEN_EXPIRED: "2";
    readonly BOX_OFFLINE: "1001";
    readonly ILLEGAL_PARAM: "1002";
    readonly ILLEGAL_OWNERSHIP: "1003";
    readonly REMOTE_CONTROL_FORBIDDEN: "1004";
    readonly INCOMPLETE_PROPERTY: "1005";
    readonly VERIFY_FAILED: "1006";
    readonly ALREADY_EXISTS: "1007";
    readonly NOT_FOUND: "1008";
    readonly OVER_LIMIT: "1009";
    readonly DUPLICATE_OPERATION: "1010";
};
export type PlatformCode = (typeof PlatformCodes)[keyof typeof PlatformCodes] | string;
/** Failure classes that never come from the platform itself. */
export declare const TransportCodes: {
    /** The device could not reach the server at all. */
    readonly NETWORK: "E_NETWORK";
    /** The server answered with a non-2xx status. */
    readonly HTTP: "E_HTTP";
    /** Response body was not the expected JSON envelope. */
    readonly PARSE: "E_PARSE";
    /** The plugin was used before `configure()` / `login()`. */
    readonly NOT_CONFIGURED: "E_NOT_CONFIGURED";
    /** Local guard rail rejected the call before hitting the network. */
    readonly INVALID_ARGUMENT: "E_INVALID_ARGUMENT";
    /** OAuth handshake (authverify2 / token / refresh) failed. */
    readonly OAUTH: "E_OAUTH";
    /** Daily per-interface quota exhausted (platform rejects with "限额"). */
    readonly QUOTA: "E_QUOTA";
    /**
     * The method exists but this appKey is not authorized for it.
     *
     * The platform reports unprovisioned methods in two misleading ways:
     *  - `接口名称(X)无效！`
     *  - `无效的接口方法参数签名！` — which looks like a signing bug but, verified
     *    against the live server, is what you get for a method that is not
     *    enabled for the key. Only treat it as this code when the same key's
     *    other calls succeed, which the client knows.
     */
    readonly NOT_PROVISIONED: "E_NOT_PROVISIONED";
    /** The call was aborted by the caller (AbortSignal). */
    readonly ABORTED: "E_ABORTED";
};
export type TransportCode = (typeof TransportCodes)[keyof typeof TransportCodes];
export declare class ElectricOpenPlatformError extends Error {
    /** Platform business code (`"0"`, `"1"`, `"2"`, `"1001"`…) or a `TransportCodes` value. */
    readonly code: PlatformCode;
    /** The `method` that failed, when the failure happened during a router call. */
    readonly method?: string;
    /** Raw server payload, kept for logging / bug reports. */
    readonly details?: unknown;
    /** HTTP status, when the failure happened at the transport layer. */
    readonly httpStatus?: number;
    constructor(code: PlatformCode, message?: string, options?: {
        method?: string;
        details?: unknown;
        httpStatus?: number;
        cause?: unknown;
    });
    /** True when the platform says the access token must be renewed. */
    get isTokenExpired(): boolean;
    /** True when a retry after a short delay is likely to succeed. */
    get isRetryable(): boolean;
    toJSON(): {
        name: string;
        code: string;
        message: string;
        method: string | undefined;
        httpStatus: number | undefined;
        details: unknown;
    };
}
export declare function isElectricOpenPlatformError(e: unknown): e is ElectricOpenPlatformError;
/** Human readable Chinese description for a platform code. */
export declare function describeCode(code: PlatformCode): string;
