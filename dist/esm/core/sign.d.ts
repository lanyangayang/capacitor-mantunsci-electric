export type ParamValue = string | number | boolean | null | undefined;
export interface SignInput {
    /** All business + common params, excluding `sign`. */
    params: Record<string, ParamValue>;
    appSecret: string;
}
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
export declare function signParams({ params, appSecret }: SignInput): string;
export declare function stringifyParam(value: ParamValue): string;
/**
 * Builds the full, signed, form-urlencoded body for `POST /invoke/router.as`.
 * `timestamp` is generated in local time as `yyyyMMddHHmmss` unless supplied.
 */
export declare function buildSignedRequest(args: {
    appKey: string;
    appSecret: string;
    method: string;
    accessToken: string;
    params?: Record<string, ParamValue>;
    timestamp?: string;
    now?: Date;
}): {
    body: string;
    params: Record<string, string>;
    sign: string;
    timestamp: string;
};
/** `application/x-www-form-urlencoded` serializer matching Java/`querystring`. */
export declare function encodeForm(params: Record<string, string>): string;
/** OAuth2 `client_secret` for the token endpoint: MD5(appKey + grant + redirect + code + secret). */
export declare function signAuthCodeSecret(args: {
    appKey: string;
    appSecret: string;
    redirectUri: string;
    code: string;
}): string;
/** OAuth2 `client_secret` for the refresh endpoint: MD5(appKey + grant + redirect + refreshToken + secret). */
export declare function signRefreshSecret(args: {
    appKey: string;
    appSecret: string;
    redirectUri: string;
    refreshToken: string;
}): string;
