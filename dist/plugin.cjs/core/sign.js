"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signParams = signParams;
exports.stringifyParam = stringifyParam;
exports.buildSignedRequest = buildSignedRequest;
exports.encodeForm = encodeForm;
exports.signAuthCodeSecret = signAuthCodeSecret;
exports.signRefreshSecret = signRefreshSecret;
const crypto_js_1 = require("./crypto.js");
/**
 * Computes the platform `sign` parameter.
 *
 * Spec (apiCallDescription): take every parameter except `sign`, sort by
 * parameter **name** ascending, concatenate the **values** in that order, then
 * append `appSecret` and MD5 the resulting UTF-8 string.
 *
 * Two details that bite in practice and are handled here:
 *  - sorting is by key name, not by key=value pairs;
 *  - `null` / `undefined` params are dropped, but empty strings are kept
 *    (they are real values, e.g. an explicitly blank `room` filter).
 */
function signParams({ params, appSecret }) {
    const keys = Object.keys(params)
        .filter((k) => k !== 'sign' && params[k] !== null && params[k] !== undefined)
        .sort();
    let raw = '';
    for (const key of keys)
        raw += stringifyParam(params[key]);
    return (0, crypto_js_1.md5)(raw + appSecret);
}
function stringifyParam(value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    return String(value);
}
/**
 * Builds the full, signed, form-urlencoded body for `POST /invoke/router.as`.
 * `timestamp` is generated in local time as `yyyyMMddHHmmss` unless supplied.
 */
function buildSignedRequest(args) {
    const { appKey, appSecret, method, accessToken, params = {} } = args;
    const timestamp = args.timestamp ?? (0, crypto_js_1.formatTimestamp)(args.now ?? new Date());
    const merged = {
        ...params,
        client_id: appKey,
        method,
        access_token: accessToken,
        timestamp,
    };
    const sign = signParams({ params: merged, appSecret });
    const finalParams = { sign };
    for (const [k, v] of Object.entries(merged)) {
        if (v === null || v === undefined)
            continue;
        finalParams[k] = stringifyParam(v);
    }
    return { body: encodeForm(finalParams), params: finalParams, sign, timestamp };
}
/** `application/x-www-form-urlencoded` serializer matching Java/`querystring`. */
function encodeForm(params) {
    return Object.keys(params)
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&');
}
/** OAuth2 `client_secret` for the token endpoint: MD5(appKey + grant + redirect + code + secret). */
function signAuthCodeSecret(args) {
    return (0, crypto_js_1.md5)(`${args.appKey}authorization_code${args.redirectUri}${args.code}${args.appSecret}`);
}
/** OAuth2 `client_secret` for the refresh endpoint: MD5(appKey + grant + redirect + refreshToken + secret). */
function signRefreshSecret(args) {
    return (0, crypto_js_1.md5)(`${args.appKey}refresh_token${args.redirectUri}${args.refreshToken}${args.appSecret}`);
}
//# sourceMappingURL=sign.js.map