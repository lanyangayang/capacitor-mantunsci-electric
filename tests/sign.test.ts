import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildSignedRequest,
  encodeForm,
  signAuthCodeSecret,
  signParams,
  signRefreshSecret,
} from '../src/core/sign';
import { md5 } from '../src/core/crypto';

const nodeMd5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

describe('signParams', () => {
  /**
   * The exact worked example from apiCallDescription.html:
   *   params: method=GET_BOXES client_id=1000 access_token=0d7cf2
   *           timestamp=20161231012518 projectCode=P00000001
   *           appSecret=9a1bf071e3
   *   concatenated: 0d7cf21000GET_BOXESP0000000120161231012518
   *   sign = MD5(concatenated + appSecret)
   */
  it('reproduces the platform documentation vector', () => {
    const sign = signParams({
      appSecret: '9a1bf071e3',
      params: {
        method: 'GET_BOXES',
        client_id: '1000',
        access_token: '0d7cf2',
        timestamp: '20161231012518',
        projectCode: 'P00000001',
      },
    });

    expect(sign).toBe(
      nodeMd5('0d7cf21000GET_BOXESP00000001201612310125189a1bf071e3'),
    );
    expect(sign).toHaveLength(32);
  });

  it('sorts by parameter name, not by value', () => {
    const sign = signParams({ appSecret: 's', params: { b: '2', a: '1', c: '3' } });
    expect(sign).toBe(md5('123s'));
  });

  it('ignores a pre-existing sign key (no double counting)', () => {
    const withSign = signParams({ appSecret: 's', params: { b: '2', a: '1', sign: 'deadbeef' } });
    const without = signParams({ appSecret: 's', params: { a: '1', b: '2' } });
    expect(withSign).toBe(without);
  });

  it('drops null/undefined but keeps empty strings', () => {
    const sign = signParams({
      appSecret: 's',
      params: { a: '1', empty: '', n: null, u: undefined },
    });
    expect(sign).toBe(md5('1s'));
  });

  it('stringifies booleans the way Java does', () => {
    const sign = signParams({ appSecret: 's', params: { enable: true, rate: 60 } });
    expect(sign).toBe(md5('true60s'));
  });

  it('is case-sensitive about key order (uppercase sorts before lowercase)', () => {
    // ASCII: 'P' (0x50) < 'a' (0x61), so P0000001 is concatenated first.
    const sign = signParams({ appSecret: 's', params: { addr: 1, projectCode: 'P0000001' } });
    expect(sign).toBe(md5('1P0000001s'));
  });
});

describe('buildSignedRequest', () => {
  it('injects the common parameters and returns a consistent body', () => {
    const built = buildSignedRequest({
      appKey: 'O000093290',
      appSecret: 'secret',
      method: 'GET_PROJECT_INFO',
      accessToken: 'tok',
      params: { projectCode: 'P00000104893' },
      timestamp: '20261028153000',
    });

    expect(built.timestamp).toBe('20261028153000');
    expect(built.params.client_id).toBe('O000093290');
    expect(built.params.method).toBe('GET_PROJECT_INFO');
    expect(built.params.timestamp).toBe('20261028153000');
    expect(built.params.sign).toBe(
      md5('tokO000093290GET_PROJECT_INFOP0000010489320261028153000secret'),
    );
    expect(built.body).toContain('sign=');
    expect(built.body).toContain('access_token=tok');
  });

  it('URL-encodes values that contain sign-breaking characters', () => {
    const built = buildSignedRequest({
      appKey: 'k',
      appSecret: 's',
      method: 'GET_BOX_CHANNELS',
      accessToken: 't',
      params: { param: '[{"mac":"a","addr":"1"}]' },
      timestamp: '20260101000000',
    });
    expect(built.body).toContain('param=%5B%7B%22mac%22');
    // The signature is computed over the raw (unencoded) values, sorted by key:
    // access_token < client_id < method < param < timestamp.
    expect(built.params.sign).toBe(
      md5('tkGET_BOX_CHANNELS[{"mac":"a","addr":"1"}]20260101000000s'),
    );
  });
});

describe('encodeForm', () => {
  it('produces application/x-www-form-urlencoded pairs', () => {
    expect(encodeForm({ a: '1', b: 'x y', c: '中' })).toBe('a=1&b=x%20y&c=%E4%B8%AD');
  });
});

describe('OAuth client_secret derivation', () => {
  // Synthetic fixtures — the real appSecret must never live in the repo.
  const appKey = 'O000000000';
  const appSecret = '0123456789abcdef0123456789abcdef';
  const redirectUri = 'http://yourserverurl/receive';

  it('hashes MD5(appKey + grant_type + redirect_uri + code + appSecret)', () => {
    const code = 'dc41d22bc19e9ad8e4739647c8c85924';
    const expected = nodeMd5(`${appKey}authorization_code${redirectUri}${code}${appSecret}`);
    // Live-verified formula against the platform on 2026-10-28.
    expect(signAuthCodeSecret({ appKey, appSecret, redirectUri, code })).toBe(expected);
  });

  it('hashes MD5(appKey + grant_type + redirect_uri + refreshToken + appSecret)', () => {
    const refreshToken = 'a8daed0c6790bb70a2e6a749dce1f414';
    const expected = nodeMd5(`${appKey}refresh_token${redirectUri}${refreshToken}${appSecret}`);
    expect(signRefreshSecret({ appKey, appSecret, redirectUri, refreshToken })).toBe(expected);
  });

  it('produces different secrets for the two grants', () => {
    const a = signAuthCodeSecret({ appKey, appSecret, redirectUri, code: 'x' });
    const b = signRefreshSecret({ appKey, appSecret, redirectUri, refreshToken: 'x' });
    expect(a).not.toBe(b);
  });
});
