/** Shared configuration and token types. */

export interface ElectricConfig {
  /** `appKey` from the open-platform console — sent as `client_id`. */
  appKey: string;
  /** `appSecret` — never leaves the device except as an MD5 digest. */
  appSecret: string;
  /** Registered callback URL; must match the console exactly (it is signed). */
  redirectUri: string;
  /** Defaults to `https://open.snd02.com`. */
  baseUrl?: string;
  /** Default `projectCode`, so most calls do not need to repeat it. */
  projectCode?: string;
  /** Request timeout in ms (default 20000). */
  timeoutMs?: number;
  /** Renew the access token this many ms before it expires (default 60000). */
  tokenRefreshSkewMs?: number;
  /** `uname` used for the headless (authverify2) login flow. */
  username?: string;
  /** `passwd` used for the headless login flow. */
  password?: string;
  /** Where tokens are persisted. Default `auto`. */
  storage?: StorageMode;
  /** Called for every request/response when set. Console-friendly. */
  logger?: ElectricLogger;
}

export type StorageMode = 'auto' | 'preferences' | 'localStorage' | 'memory';

export type ElectricLogger = (event: ElectricLogEvent) => void;

export interface ElectricLogEvent {
  type: 'request' | 'response' | 'token' | 'error';
  method?: string;
  /** Never contains the access token or the secret; bodies are redacted. */
  detail?: Record<string, unknown>;
  message: string;
  at: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** `tokenType` as returned — the platform sends `"BEARER"`. */
  tokenType: string;
  /** Unix epoch ms at which the access token expires. */
  expiresAt: number;
}

export interface LoginResult {
  success: true;
  /** The OAuth temporary code that was exchanged. */
  code: string;
  expiresIn: number;
  expiresAt: number;
}

/** Envelope every `router.as` response shares. */
export interface ApiEnvelope<T> {
  code: string;
  message?: string;
  success?: boolean;
  data: T;
}

export const DEFAULT_BASE_URL = 'https://open.snd02.com';
