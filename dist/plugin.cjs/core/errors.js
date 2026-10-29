"use strict";
/**
 * Error model for the Mtsci (snd02) open platform.
 *
 * Every failure — transport, OAuth or business return code — surfaces as an
 * `ElectricOpenPlatformError` so callers can branch on `code` instead of
 * parsing `message` strings.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ElectricOpenPlatformError = exports.TransportCodes = exports.PlatformCodes = void 0;
exports.isElectricOpenPlatformError = isElectricOpenPlatformError;
exports.describeCode = describeCode;
exports.PlatformCodes = {
    OK: '0',
    NOT_LOGGED_IN: '-1',
    FAILED: '1',
    TOKEN_EXPIRED: '2',
    BOX_OFFLINE: '1001',
    ILLEGAL_PARAM: '1002',
    ILLEGAL_OWNERSHIP: '1003',
    REMOTE_CONTROL_FORBIDDEN: '1004',
    INCOMPLETE_PROPERTY: '1005',
    VERIFY_FAILED: '1006',
    ALREADY_EXISTS: '1007',
    NOT_FOUND: '1008',
    OVER_LIMIT: '1009',
    DUPLICATE_OPERATION: '1010',
};
const CODE_MESSAGES = {
    '-1': '未登录或会话已过期',
    '1': '接口调用失败',
    '2': 'accessToken 已过期',
    '1001': '设备不在线',
    '1002': '不合法的参数',
    '1003': '不合法的归属',
    '1004': '不允许远程控制',
    '1005': '不完整的设备属性',
    '1006': '校验失败（例如密码错误）',
    '1007': '资源已存在',
    '1008': '相关资源不存在',
    '1009': '资源超过最大限制',
    '1010': '不能重复操作',
};
/** Failure classes that never come from the platform itself. */
exports.TransportCodes = {
    /** The device could not reach the server at all. */
    NETWORK: 'E_NETWORK',
    /** The server answered with a non-2xx status. */
    HTTP: 'E_HTTP',
    /** Response body was not the expected JSON envelope. */
    PARSE: 'E_PARSE',
    /** The plugin was used before `configure()` / `login()`. */
    NOT_CONFIGURED: 'E_NOT_CONFIGURED',
    /** Local guard rail rejected the call before hitting the network. */
    INVALID_ARGUMENT: 'E_INVALID_ARGUMENT',
    /** OAuth handshake (authverify2 / token / refresh) failed. */
    OAUTH: 'E_OAUTH',
    /** Daily per-interface quota exhausted (platform rejects with "限额"). */
    QUOTA: 'E_QUOTA',
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
    NOT_PROVISIONED: 'E_NOT_PROVISIONED',
    /** The call was aborted by the caller (AbortSignal). */
    ABORTED: 'E_ABORTED',
};
class ElectricOpenPlatformError extends Error {
    constructor(code, message, options = {}) {
        super(message || CODE_MESSAGES[code] || `调用失败 (code=${code})`);
        this.name = 'ElectricOpenPlatformError';
        this.code = code;
        this.method = options.method;
        this.details = options.details;
        this.httpStatus = options.httpStatus;
        if (options.cause !== undefined)
            this.cause = options.cause;
    }
    /** True when the platform says the access token must be renewed. */
    get isTokenExpired() {
        return this.code === exports.PlatformCodes.TOKEN_EXPIRED || this.code === exports.PlatformCodes.NOT_LOGGED_IN;
    }
    /** True when a retry after a short delay is likely to succeed. */
    get isRetryable() {
        return (this.code === exports.TransportCodes.NETWORK ||
            this.code === exports.PlatformCodes.BOX_OFFLINE ||
            (this.httpStatus !== undefined && this.httpStatus >= 500));
    }
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            method: this.method,
            httpStatus: this.httpStatus,
            details: this.details,
        };
    }
}
exports.ElectricOpenPlatformError = ElectricOpenPlatformError;
function isElectricOpenPlatformError(e) {
    return e instanceof ElectricOpenPlatformError;
}
/** Human readable Chinese description for a platform code. */
function describeCode(code) {
    return CODE_MESSAGES[String(code)] || `未知返回码 (${code})`;
}
//# sourceMappingURL=errors.js.map