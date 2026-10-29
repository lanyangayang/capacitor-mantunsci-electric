import { formatTimestamp, md5 } from './crypto.js';

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
export function signParams({ params, appSecret }: SignInput): string {
  const keys = Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== null && params[k] !== undefined)
    .sort();
  let raw = '';
  for (const key of keys) raw += stringifyParam(params[key]);
  return md5(raw + appSecret);
}

export function stringifyParam(value: ParamValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

/**
 * Builds the full, signed, form-urlencoded body for `POST /invoke/router.as`.
 * `timestamp` is generated in local time as `yyyyMMddHHmmss` unless supplied.
 */
export function buildSignedRequest(args: {
  appKey: string;
  appSecret: string;
  method: string;
  accessToken: string;
  params?: Record<string, ParamValue>;
  timestamp?: string;
  now?: Date;
}): { body: string; params: Record<string, string>; sign: string; timestamp: string } {
  const { appKey, appSecret, method, accessToken, params = {} } = args;
  const timestamp = args.timestamp ?? formatTimestamp(args.now ?? new Date());

  const merged: Record<string, ParamValue> = {
    ...params,
    client_id: appKey,
    method,
    access_token: accessToken,
    timestamp,
  };

  const sign = signParams({ params: merged, appSecret });

  const finalParams: Record<string, string> = { sign };
  for (const [k, v] of Object.entries(merged)) {
    if (v === null || v === undefined) continue;
    finalParams[k] = stringifyParam(v);
  }

  return { body: encodeForm(finalParams), params: finalParams, sign, timestamp };
}

/** `application/x-www-form-urlencoded` serializer matching Java/`querystring`. */
export function encodeForm(params: Record<string, string>): string {
  return Object.keys(params)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
}

/** OAuth2 `client_secret` for the token endpoint: MD5(appKey + grant + redirect + code + secret). */
export function signAuthCodeSecret(args: {
  appKey: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): string {
  return md5(`${args.appKey}authorization_code${args.redirectUri}${args.code}${args.appSecret}`);
}

/** OAuth2 `client_secret` for the refresh endpoint: MD5(appKey + grant + redirect + refreshToken + secret). */
export function signRefreshSecret(args: {
  appKey: string;
  appSecret: string;
  redirectUri: string;
  refreshToken: string;
}): string {
  return md5(`${args.appKey}refresh_token${args.redirectUri}${args.refreshToken}${args.appSecret}`);
}
