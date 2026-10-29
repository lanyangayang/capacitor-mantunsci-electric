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
import { ElectricOpenPlatformError, PlatformCodes, TransportCodes } from './errors.js';
import { postForm } from './http.js';
import { buildSignedRequest, ParamValue } from './sign.js';
import { DEFAULT_BASE_URL, ElectricConfig, ElectricLogger } from './types.js';

const ROUTER_PATH = '/invoke/router.as';

/** Params controlled by the client — rejected in the caller's `params`. */
const RESERVED_PARAMS = new Set(['client_id', 'method', 'access_token', 'timestamp', 'sign']);

export interface CallOptions {
  /** Overrides the configured default project code. */
  projectCode?: string;
  params?: Record<string, ParamValue>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Internal: prevents an endless refresh → retry → refresh loop. */
  _retried?: boolean;
}

export class RouterClient {
  private readonly config: {
    appKey: string;
    appSecret: string;
    baseUrl: string;
    timeoutMs: number;
    projectCode?: string;
  };
  private readonly auth: AuthManager;
  private readonly logger?: ElectricLogger;
  private readonly credentials: () => { username?: string; password?: string };
  /** Once any signed call succeeds we can attribute 签名 errors to provisioning. */
  private hasAnySuccess = false;
  constructor(
    config: ElectricConfig,
    auth: AuthManager,
    credentials: () => { username?: string; password?: string },
  ) {
    this.auth = auth;
    this.logger = config.logger;
    this.credentials = credentials;
    this.config = {
      appKey: config.appKey,
      appSecret: config.appSecret,
      baseUrl: (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
      timeoutMs: config.timeoutMs ?? 20_000,
      projectCode: config.projectCode,
    };
  }

  /**
   * Calls one platform method and returns its `data` payload.
   *
   * @throws ElectricOpenPlatformError for transport failures and non-zero codes.
   */
  async call<T>(method: string, options: CallOptions = {}): Promise<T> {
    const params = { ...(options.params ?? {}) };
    for (const key of Object.keys(params)) {
      if (RESERVED_PARAMS.has(key)) {
        throw new ElectricOpenPlatformError(
          TransportCodes.INVALID_ARGUMENT,
          `参数 ${key} 由插件自动生成，请勿手动传入`,
          { method },
        );
      }
    }

    const projectCode = options.projectCode ?? this.config.projectCode;
    if (projectCode !== undefined && params.projectCode === undefined) {
      params.projectCode = projectCode;
    }

    const accessToken = await this.auth.getAccessToken(this.credentials());

    const { body, params: signed } = buildSignedRequest({
      appKey: this.config.appKey,
      appSecret: this.config.appSecret,
      method,
      accessToken,
      params,
    });

    this.emit('request', method, {
      timestamp: signed.timestamp,
      params: redact(signed),
    });

    const res = await postForm({
      url: `${this.config.baseUrl}${ROUTER_PATH}`,
      body,
      timeoutMs: options.timeoutMs ?? this.config.timeoutMs,
      signal: options.signal,
    });

    const envelope = res.data as
      | { code?: string; message?: string; success?: boolean; data?: T }
      | string
      | null;

    if (!envelope || typeof envelope !== 'object') {
      throw new ElectricOpenPlatformError(
        TransportCodes.PARSE,
        '接口返回格式异常（非 JSON 对象）',
        { method, details: res.raw },
      );
    }

    const code = String(envelope.code ?? PlatformCodes.FAILED);

    if (code === PlatformCodes.OK) {
      this.hasAnySuccess = true;
      this.emit('response', method, { code, success: envelope.success });
      return envelope.data as T;
    }

    // Token expired / session gone: renew once, then retry the same request.
    if ((code === PlatformCodes.TOKEN_EXPIRED || code === PlatformCodes.NOT_LOGGED_IN) && !options._retried) {
      this.emit('error', method, { code, message: 'accessToken 失效，正在刷新后重试' });
      await this.renewToken(code);
      return this.call<T>(method, { ...options, _retried: true });
    }

    const err = new ElectricOpenPlatformError(code, envelope.message, {
      method,
      details: res.data,
    });
    this.emit('error', method, { code, message: envelope.message });

    if (envelope.message && /限额|超过.*次数|quota/i.test(envelope.message)) {
      throw new ElectricOpenPlatformError(TransportCodes.QUOTA, envelope.message, {
        method,
        details: res.data,
      });
    }

    // The platform signals "method not enabled for this appKey" with either
    // "接口名称(X)无效！" or — misleadingly — "无效的接口方法参数签名！".
    // We can only be sure it is a provisioning problem (and not a signing bug)
    // when another call with the same key has already succeeded this session.
    const notProvisionedHint =
      /接口方法参数签名/.test(envelope.message ?? '') ||
      /接口名称\(.*\)无效/.test(envelope.message ?? '');
    if (notProvisionedHint && this.hasAnySuccess) {
      throw new ElectricOpenPlatformError(
        TransportCodes.NOT_PROVISIONED,
        `接口 ${method} 未对当前 appKey 开通（平台提示：${envelope.message}）。请联系平台商务开通该接口权限。`,
        { method, details: res.data },
      );
    }

    throw err;
  }

  /** Convenience: call a method that returns a paginated `data` object. */
  async callPaged<T>(method: string, options: CallOptions = {}): Promise<T> {
    return this.call<T>(method, options);
  }

  private async renewToken(code: string): Promise<void> {
    this.emit('token', 'router', { reason: `code=${code}` });
    await this.auth.recover(this.credentials());
  }

  private emit(type: Parameters<ElectricLogger>[0]['type'], method: string, detail?: Record<string, unknown>): void {
    this.logger?.({ type, method, detail, message: `${type} ${method}`, at: new Date().toISOString() });
  }
}

/** Strips secrets from a logged params object. */
function redact(params: Record<string, string>): Record<string, string> {
  const copy: Record<string, string> = { ...params };
  if (copy.sign) copy.sign = `${copy.sign.slice(0, 6)}…`;
  if (copy.access_token) copy.access_token = `${copy.access_token.slice(0, 6)}…`;
  if (copy.passwd) copy.passwd = '***';
  if (copy.client_secret) copy.client_secret = `${copy.client_secret.slice(0, 6)}…`;
  return copy;
}
