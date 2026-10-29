import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- transport mock -------------------------------------------------------
// The plugin funnels every request through `postForm`, so mocking that single
// seam exercises signing, token handling and envelope unwrapping end to end.
const postFormMock = vi.fn();
vi.mock('../src/core/http', () => ({
  postForm: (req: unknown) => postFormMock(req),
}));

import { AuthManager } from '../src/core/auth';
import { ElectricOpenPlatformError, PlatformCodes, TransportCodes } from '../src/core/errors';
import { RouterClient } from '../src/core/router';
import { TokenStore } from '../src/core/storage';
import { ElectricConfig, TokenSet } from '../src/core/types';
import { signParams } from '../src/core/sign';

const memoryMap = new Map<string, string>();
const memoryBackend = {
  name: 'memory' as const,
  async get(key: string) {
    return memoryMap.get(key) ?? null;
  },
  async set(key: string, value: string) {
    memoryMap.set(key, value);
  },
  async remove(key: string) {
    memoryMap.delete(key);
  },
};

const config: ElectricConfig = {
  appKey: 'O000093290',
  appSecret: 'apsecret',
  redirectUri: 'http://yourserverurl/receive',
  baseUrl: 'https://open.snd02.com',
  projectCode: 'P00000104893',
  storage: 'memory',
  tokenRefreshSkewMs: 60_000,
};

function tokenResponse(accessToken = 'ACCESS1', refreshToken = 'REFRESH1', expiresIn = 3600) {
  return {
    status: 200,
    data: {
      code: '0',
      message: '成功',
      success: true,
      data: { expiresIn, tokenType: 'BEARER', accessToken, refreshToken },
    },
    raw: '',
  };
}

function ok(data: unknown) {
  return { status: 200, data: { code: '0', message: '成功', success: true, data }, raw: '' };
}

function business(code: string, message = '失败') {
  return { status: 200, data: { code, message, success: false }, raw: '' };
}

function lastBody(): URLSearchParams {
  const call = postFormMock.mock.calls.at(-1);
  return new URLSearchParams((call?.[0] as { body: string }).body);
}

function makeAuth() {
  const store = new TokenStore(memoryBackend, config.appKey);
  return { store, auth: new AuthManager(store, config) };
}

beforeEach(() => {
  memoryMap.clear();
  postFormMock.mockReset();
});

describe('AuthManager', () => {
  it('exchanges a code for a token and persists it', async () => {
    postFormMock.mockResolvedValueOnce(tokenResponse());
    const { store, auth } = makeAuth();

    const tokens = await auth.exchangeCode('CODE123');

    expect(tokens.accessToken).toBe('ACCESS1');
    expect(tokens.tokenType).toBe('BEARER');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    expect(await store.readTokens<TokenSet>()).toMatchObject({ accessToken: 'ACCESS1' });

    const body = lastBody();
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('CODE123');
    expect(body.get('client_secret')).toHaveLength(32);
    auth.dispose();
  });

  it('refreshes instead of relogging when the token is near expiry', async () => {
    postFormMock.mockResolvedValueOnce(tokenResponse('OLD', 'REFRESH1', 3600));
    const { auth } = makeAuth();
    await auth.exchangeCode('C1');

    // Force expiry.
    (auth as unknown as { tokens: TokenSet }).tokens.expiresAt = Date.now() - 1;

    postFormMock.mockResolvedValueOnce(tokenResponse('NEW', 'REFRESH2'));
    const token = await auth.getAccessToken();

    expect(token).toBe('NEW');
    expect(lastBody().get('grant_type')).toBe('refresh_token');
    expect(lastBody().get('refresh_token')).toBe('REFRESH1');
    auth.dispose();
  });

  it('falls back to a password login when refresh fails', async () => {
    postFormMock.mockResolvedValueOnce(tokenResponse('OLD', 'REFRESH1', 3600));
    const { auth } = makeAuth();
    await auth.exchangeCode('C1');
    (auth as unknown as { tokens: TokenSet }).tokens.expiresAt = Date.now() - 1;

    postFormMock
      .mockRejectedValueOnce(new ElectricOpenPlatformError(TransportCodes.OAUTH, 'refresh dead'))
      .mockResolvedValueOnce({ status: 200, data: { code: 'abc', success: 'true' }, raw: '' })
      .mockResolvedValueOnce(tokenResponse('BRANDNEW', 'REFRESH9'));

    const token = await auth.getAccessToken({ username: 'u', password: 'p' });
    expect(token).toBe('BRANDNEW');
    auth.dispose();
  });

  it('shares one in-flight refresh across concurrent callers', async () => {
    postFormMock.mockResolvedValueOnce(tokenResponse('OLD', 'REFRESH1', 3600));
    const { auth } = makeAuth();
    await auth.exchangeCode('C1');
    (auth as unknown as { tokens: TokenSet }).tokens.expiresAt = Date.now() - 1;

    postFormMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return tokenResponse('NEW', 'R2');
    });

    const results = await Promise.all([auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()]);
    expect(results).toEqual(['NEW', 'NEW', 'NEW']);
    // one initial exchange + exactly one refresh
    expect(postFormMock).toHaveBeenCalledTimes(2);
    auth.dispose();
  });

  it('throws NOT_CONFIGURED when the token is gone and there are no credentials', async () => {
    const { auth } = makeAuth();
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: TransportCodes.NOT_CONFIGURED });
    auth.dispose();
  });

  it('rejects a failed authverify2 response', async () => {
    postFormMock.mockResolvedValueOnce({
      status: 200,
      data: { code: '', success: 'false', message: '密码错误' },
      raw: '',
    });
    const { auth } = makeAuth();
    await expect(auth.fetchCode({ username: 'u', password: 'bad' })).rejects.toMatchObject({
      code: TransportCodes.OAUTH,
    });
    auth.dispose();
  });

  it('extracts the code from a redirect URL', () => {
    expect(AuthManager.extractCode('http://h/receive?code=a9aa00&state=x')).toBe('a9aa00');
    expect(AuthManager.extractCode('http://h/receive#code=zz')).toBe('zz');
    expect(AuthManager.extractCode('http://h/receive?state=x')).toBeNull();
  });

  it('builds a signed authorize URL', () => {
    const { auth } = makeAuth();
    const url = auth.getAuthorizeUrl({ state: 's1' });
    expect(url).toContain('https://open.snd02.com/oauth/authorize.as?');
    expect(url).toContain('client_id=O000093290');
    expect(url).toContain('response_type=code');
    expect(url).toContain(`redirect_uri=${encodeURIComponent(config.redirectUri)}`);
    auth.dispose();
  });
});

describe('RouterClient', () => {
  async function setup() {
    const store = new TokenStore(memoryBackend, config.appKey);
    const auth = new AuthManager(store, config);
    postFormMock.mockResolvedValueOnce(tokenResponse('TOKEN_A', 'REFRESH_A'));
    await auth.exchangeCode('C1');
    const credentials = { username: 'test-user', password: 'test-password' };
    const router = new RouterClient(config, auth, () => credentials);
    return { auth, router };
  }

  it('sends a correctly signed, project-scoped request and unwraps data', async () => {
    const { auth, router } = await setup();
    postFormMock.mockResolvedValueOnce(ok({ projectCode: 'P00000104893', projectName: '毅丰' }));

    const data = await router.call<{ projectName: string }>('GET_PROJECT_INFO');

    expect(data.projectName).toBe('毅丰');
    const request = postFormMock.mock.calls.at(-1)?.[0] as { url: string; body: string };
    expect(request.url).toBe('https://open.snd02.com/invoke/router.as');

    const body = new URLSearchParams(request.body);
    expect(body.get('method')).toBe('GET_PROJECT_INFO');
    expect(body.get('client_id')).toBe('O000093290');
    expect(body.get('access_token')).toBe('TOKEN_A');
    expect(body.get('projectCode')).toBe('P00000104893');
    expect(body.get('timestamp')).toMatch(/^\d{14}$/);

    const signature = body.get('sign');
    body.delete('sign');
    const params: Record<string, string> = {};
    body.forEach((v, k) => (params[k] = v));
    expect(signature).toBe(signParams({ params, appSecret: config.appSecret }));
    auth.dispose();
  });

  it('refreshes once on code "2" and retries the same call', async () => {
    const { auth, router } = await setup();
    postFormMock
      .mockResolvedValueOnce(business(PlatformCodes.TOKEN_EXPIRED, 'accessToken过期'))
      .mockResolvedValueOnce(tokenResponse('TOKEN_B', 'REFRESH_B'))
      .mockResolvedValueOnce(ok([{ mac: '98CC4D13AE24' }]));

    const boxes = await router.call<{ mac: string }[]>('GET_BOXES');

    expect(boxes[0].mac).toBe('98CC4D13AE24');
    const bodies = postFormMock.mock.calls.map((c) => new URLSearchParams((c[0] as { body: string }).body));
    // 3rd call used the refreshed token
    expect(bodies.at(-1)?.get('access_token')).toBe('TOKEN_B');
    auth.dispose();
  });

  it('does not loop forever when the retry also expires', async () => {
    const { auth, router } = await setup();
    // First call answers code 2, then the recovery login and the retry also fail.
    postFormMock.mockResolvedValue(business(PlatformCodes.TOKEN_EXPIRED, 'accessToken过期'));
    const err = await router.call('GET_BOXES').catch((e) => e as ElectricOpenPlatformError);

    expect(err).toBeInstanceOf(ElectricOpenPlatformError);
    // Recovery reports the OAuth failure rather than retrying endlessly.
    expect(err?.code).toBe(TransportCodes.OAUTH);
    // token exchange + refresh attempt + authverify2 attempt — bounded.
    expect(postFormMock.mock.calls.length).toBeLessThanOrEqual(4);
    auth.dispose();
  });

  it('maps business codes to typed errors', async () => {
    const { auth, router } = await setup();
    postFormMock.mockResolvedValueOnce(business(PlatformCodes.REMOTE_CONTROL_FORBIDDEN, '不允许远程控制'));

    await expect(router.call('PUT_BOX_CONTROL', { params: { mac: 'm', cmd: 'OCSWITCH' } })).rejects.toMatchObject({
      code: '1004',
      method: 'PUT_BOX_CONTROL',
      message: '不允许远程控制',
    });
    auth.dispose();
  });

  it('flags quota exhaustion with a dedicated transport code', async () => {
    const { auth, router } = await setup();
    postFormMock.mockResolvedValueOnce(business(PlatformCodes.FAILED, '超过每日限额，请明日再试'));
    await expect(router.call('GET_BOXES')).rejects.toMatchObject({ code: TransportCodes.QUOTA });
    auth.dispose();
  });

  it('refuses caller-supplied reserved parameters', async () => {
    const { auth, router } = await setup();
    await expect(router.call('GET_BOXES', { params: { sign: 'x' } })).rejects.toMatchObject({
      code: TransportCodes.INVALID_ARGUMENT,
    });
    expect(postFormMock).toHaveBeenCalledTimes(1); // only the token exchange
    auth.dispose();
  });

  it('rejects a non-JSON body', async () => {
    const { auth, router } = await setup();
    postFormMock.mockResolvedValueOnce({ status: 200, data: '<html>oops</html>', raw: '<html>oops</html>' });
    await expect(router.call('GET_BOXES')).rejects.toMatchObject({ code: TransportCodes.PARSE });
    auth.dispose();
  });
});

describe('provisioning errors', () => {
  async function setup() {
    const store = new TokenStore(memoryBackend, config.appKey);
    const auth = new AuthManager(store, config);
    postFormMock.mockResolvedValueOnce(tokenResponse('T', 'R'));
    await auth.exchangeCode('C1');
    const router = new RouterClient(config, auth, () => ({}));
    return { auth, router };
  }

  it('reports an unprovisioned method explicitly once another call succeeded', async () => {
    const { auth, router } = await setup();
    postFormMock.mockResolvedValueOnce(ok([]));
    await router.call('GET_BOXES'); // establishes "signing works"

    postFormMock.mockResolvedValueOnce(business(PlatformCodes.FAILED, '无效的接口方法参数签名！'));
    const err = await router.call('GET_BOX', { params: { mac: 'A' } }).catch((e) => e);

    expect(err.code).toBe(TransportCodes.NOT_PROVISIONED);
    expect(err.message).toContain('未对当前 appKey 开通');
    auth.dispose();
  });

  it('keeps the raw platform error when nothing has succeeded yet', async () => {
    const { auth, router } = await setup();
    postFormMock.mockResolvedValueOnce(business(PlatformCodes.FAILED, '无效的接口方法参数签名！'));
    const err = await router.call('GET_BOX', { params: { mac: 'A' } }).catch((e) => e);
    // We must not claim "not provisioned" before we know signing works.
    expect(err.code).toBe(PlatformCodes.FAILED);
    auth.dispose();
  });

  it('recognises the explicit 无效的接口 message', async () => {
    const { auth, router } = await setup();
    postFormMock.mockResolvedValueOnce(ok([]));
    await router.call('GET_BOXES');
    postFormMock.mockResolvedValueOnce(business(PlatformCodes.FAILED, '接口名称(GET_BOXS_DAY_STATS)无效！'));
    const err = await router.call('GET_BOXS_DAY_STATS').catch((e) => e);
    expect(err.code).toBe(TransportCodes.NOT_PROVISIONED);
    auth.dispose();
  });
});

describe('ElectricOpenPlatformError', () => {
  it('classifies token / retryable failures', () => {
    const expired = new ElectricOpenPlatformError(PlatformCodes.TOKEN_EXPIRED);
    expect(expired.isTokenExpired).toBe(true);
    expect(expired.isRetryable).toBe(false);

    const offline = new ElectricOpenPlatformError(PlatformCodes.BOX_OFFLINE);
    expect(offline.isRetryable).toBe(true);
    expect(offline.message).toBe('设备不在线');

    const net = new ElectricOpenPlatformError(TransportCodes.NETWORK);
    expect(net.isRetryable).toBe(true);
  });

  it('serialises without leaking internals', () => {
    const err = new ElectricOpenPlatformError('1002', undefined, { method: 'GET_BOX', details: { a: 1 } });
    expect(JSON.parse(JSON.stringify(err))).toEqual({
      name: 'ElectricOpenPlatformError',
      code: '1002',
      message: '不合法的参数',
      method: 'GET_BOX',
      details: { a: 1 },
    });
  });
});
