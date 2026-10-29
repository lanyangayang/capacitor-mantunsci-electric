import { beforeEach, describe, expect, it, vi } from 'vitest';

const postFormMock = vi.fn();
vi.mock('../src/core/http', () => ({
  postForm: (req: unknown) => postFormMock(req),
}));

import { ElectricOpenPlatformClient } from '../src/client';
import { AlarmType } from '../src/core/models';
import { ElectricOpenPlatformError, TransportCodes } from '../src/core/errors';

const config = {
  appKey: 'O000093290',
  appSecret: 'apsecret',
  redirectUri: 'http://yourserverurl/receive',
  baseUrl: 'https://open.snd02.com',
  projectCode: 'P00000104893',
  storage: 'memory' as const,
};

function tokenResponse() {
  return {
    status: 200,
    data: {
      code: '0',
      success: true,
      data: { expiresIn: 3600, tokenType: 'BEARER', accessToken: 'TOK', refreshToken: 'REF' },
    },
    raw: '',
  };
}

const ok = (data: unknown) => ({ status: 200, data: { code: '0', message: '成功', success: true, data }, raw: '' });

const lastParams = () => {
  const body = new URLSearchParams((postFormMock.mock.calls.at(-1)?.[0] as { body: string }).body);
  const out: Record<string, string> = {};
  body.forEach((v, k) => (out[k] = v));
  return out;
};

let client: ElectricOpenPlatformClient;

beforeEach(async () => {
  postFormMock.mockReset();
  postFormMock.mockResolvedValue(tokenResponse());
  client = new ElectricOpenPlatformClient();
  await client.configure(config);
  await client.login('yfdq01', 'pwd');
  // Domain tests supply their own single response; the login one is spent.
  postFormMock.mockReset();
});

describe('configure / login', () => {
  it('validates required configuration', async () => {
    const c = new ElectricOpenPlatformClient();
    await expect(c.configure({ appKey: '', appSecret: 'x', redirectUri: 'http://a/b' })).rejects.toThrow(
      /appKey/,
    );
    await expect(
      c.configure({ appKey: 'k', appSecret: 's', redirectUri: 'not-a-url' }),
    ).rejects.toThrow(/redirectUri/);
  });

  it('exposes a masked config and the current token', () => {
    const described = client.describe();
    expect(described.appSecret).toBe('****cret');
    // Short tokens are fully redacted rather than partially revealed.
    expect((described.token as { accessToken: string }).accessToken).toBe('****');
    expect(client.isConfigured).toBe(true);
  });

  it('partially masks a realistic-length token', async () => {
    const c = new ElectricOpenPlatformClient();
    await c.configure(config);
    postFormMock.mockReset();
    postFormMock.mockResolvedValue({
      status: 200,
      data: {
        code: '0',
        success: true,
        data: { expiresIn: 3600, tokenType: 'BEARER', accessToken: '29fa24e0661583a76bb071069c13a763', refreshToken: 'R' },
      },
      raw: '',
    });
    await c.login('u', 'p');
    const token = (c.describe().token as { accessToken: string }).accessToken;
    expect(token).toBe('29fa24…a763');
  });

  it('does not leak the secret into the login request body', async () => {
    const c = new ElectricOpenPlatformClient();
    await c.configure(config);
    postFormMock.mockReset();
    postFormMock.mockResolvedValue(tokenResponse());
    await c.login('yfdq01', 'pwd');

    const bodies = postFormMock.mock.calls.map((call) => (call[0] as { body: string }).body);
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b).not.toContain(config.appSecret);
  });
});

describe('BoxApi', () => {
  it('sends nodeType=COMM when reading properties (required by the platform)', async () => {
    postFormMock.mockResolvedValueOnce(ok({ protocol: 'UDP' }));
    await client.box.properties({ mac: 'A' });
    expect(lastParams().nodeType).toBe('COMM');
    expect(lastParams().mac).toBe('A');
  });

  it('uses startTime/endTime for online history, not start/end', async () => {
    postFormMock.mockResolvedValueOnce(ok({ total: 0, page: 1, totalPage: 0, datas: [] }));
    await client.box.onlineHistory({
      mac: 'A',
      startTime: new Date(2026, 9, 27, 0, 0),
      endTime: new Date(2026, 9, 28, 0, 0),
    });
    const p = lastParams();
    expect(p.startTime).toBe('2026-10-27 00:00');
    expect(p.endTime).toBe('2026-10-28 00:00');
    expect(p.start).toBeUndefined();
    expect(p.end).toBeUndefined();
  });

  it('lists boxes scoped to the configured project', async () => {
    postFormMock.mockResolvedValueOnce(ok([{ mac: 'A', online: 1 }, { mac: 'B', online: 0 }]));
    const boxes = await client.box.list();
    expect(boxes).toHaveLength(2);
    expect(lastParams().method).toBe('GET_BOXES');
    expect(lastParams().projectCode).toBe('P00000104893');
  });

  it('filters online boxes client-side', async () => {
    postFormMock.mockResolvedValueOnce(
      ok([{ mac: 'A', online: 1 }, { mac: 'B', online: 0 }, { mac: 'C', online: -1 }]),
    );
    const online = await client.box.listOnline();
    expect(online.map((b) => b.mac)).toEqual(['A']);
  });

  it('rejects a rate below the platform minimum', () => {
    expect(() => client.box.setRealtimeRate({ mac: 'A', enable: true, rate: 2 })).toThrow(/>= 5/);
  });

  it('joins mac arrays into a comma list for rate changes', async () => {
    postFormMock.mockResolvedValueOnce(ok(null));
    await client.box.setRealtimeRate({ mac: ['A', 'B'], enable: false, rate: 60 });
    const p = lastParams();
    expect(p.mac).toBe('A,B');
    expect(p.enable).toBe('false');
    expect(p.rate).toBe('60');
  });
});

describe('ChannelApi.realtime normalisation', () => {
  it('wraps the single-mac shape into BoxRealtime[]', async () => {
    postFormMock.mockResolvedValueOnce(ok([{ addr: 1, oc: true }, { addr: 2, oc: false }]));
    const result = await client.channel.realtime({ mac: '98CC4D13AE24' });
    expect(result).toEqual([
      { mac: '98CC4D13AE24', channelList: [{ addr: 1, oc: true, mac: '98CC4D13AE24' }, { addr: 2, oc: false, mac: '98CC4D13AE24' }] },
    ]);
  });

  it('keeps the wrapped shape for multiple macs', async () => {
    postFormMock.mockResolvedValueOnce(
      ok([
        { mac: 'A', channelList: [{ addr: 1, oc: true }] },
        { mac: 'B', channelList: [{ addr: 1, oc: false }] },
      ]),
    );
    const result = await client.channel.realtime({ mac: ['A', 'B'] });
    expect(result.map((r) => r.mac)).toEqual(['A', 'B']);
    expect(result[1].channelList[0].mac).toBe('B');
  });

  it('rejects more than 20 macs (platform limit)', async () => {
    const macs = Array.from({ length: 21 }, (_, i) => `M${i}`);
    await expect(client.channel.realtime({ mac: macs })).rejects.toThrow(/20/);
  });

  it('flattens channels with their mac attached', async () => {
    postFormMock.mockResolvedValueOnce(
      ok([
        { mac: 'A', channelList: [{ addr: 1, title: '总路' }] },
        { mac: 'B', channelList: [{ addr: 1, title: '线路1' }] },
      ]),
    );
    const channels = await client.channel.realtimeChannels({ mac: ['A', 'B'] });
    expect(channels).toEqual([
      { addr: 1, title: '总路', mac: 'A' },
      { addr: 1, title: '线路1', mac: 'B' },
    ]);
  });
});

describe('ControlApi', () => {
  it('flattens typed options into value1/value2', async () => {
    postFormMock.mockResolvedValueOnce(ok({ code: '0', message: '命令推送成功!' }));
    await client.control.switchCircuit({ mac: 'A', action: 'close', addr: [1, 2] });

    const p = lastParams();
    expect(p.method).toBe('PUT_BOX_CONTROL');
    expect(p.cmd).toBe('OCSWITCH');
    expect(p.value1).toBe('close');
    expect(p.value2).toBe('1,2');
    expect(p.value3).toBeUndefined();
  });

  it('sends ABNORMAL_LOCK_CHECK only when asked', async () => {
    postFormMock.mockResolvedValueOnce(ok(null));
    await client.control.switchCircuit({ mac: 'A', action: 'open', addr: 1, skipWhenAbnormalLock: true });
    expect(lastParams().value3).toBe('ABNORMAL_LOCK_CHECK');
  });
});

describe('AlarmApi', () => {
  it('normalises the paged envelope', async () => {
    postFormMock.mockResolvedValueOnce(
      ok({ total: 2, page: 1, totalPage: 1, datas: [{ id: 1, typeNumber: 3 }, { id: 2, typeNumber: 11 }] }),
    );
    const page = await client.alarm.list({
      mac: 'A',
      start: '2026-10-27 00:00',
      end: '2026-10-28 00:00',
      includeCalm: true,
    });
    expect(page.total).toBe(2);
    expect(page.datas).toHaveLength(2);
    expect(lastParams().includeCalm).toBe('true');
  });

  it('accepts Date objects and formats them as yyyy-MM-dd HH:mm', async () => {
    postFormMock.mockResolvedValueOnce(ok({ total: 0, page: 1, totalPage: 0, datas: [] }));
    await client.alarm.list({ start: new Date(2026, 9, 27, 8, 5), end: new Date(2026, 9, 27, 20, 30) });
    expect(lastParams().start).toBe('2026-10-27 08:05');
    expect(lastParams().end).toBe('2026-10-27 20:30');
  });

  it('refuses windows longer than 48 hours before hitting the network', async () => {
    const before = postFormMock.mock.calls.length;
    await expect(
      client.alarm.list({ start: '2026-10-01 00:00', end: '2026-10-05 00:00' }),
    ).rejects.toThrow(/48/);
    expect(postFormMock.mock.calls.length).toBe(before);
  });

  it('rejects an inverted window', async () => {
    await expect(
      client.alarm.list({ start: '2026-10-28 10:00', end: '2026-10-28 09:00' }),
    ).rejects.toThrow(/end 必须大于 start/);
  });

  it('walks pages and filters by alarm type', async () => {
    postFormMock
      .mockResolvedValueOnce(ok({ total: 3, page: 1, totalPage: 2, datas: [{ id: 1, typeNumber: 3 }] }))
      .mockResolvedValueOnce(
        ok({ total: 3, page: 2, totalPage: 2, datas: [{ id: 2, typeNumber: 11 }, { id: 3, typeNumber: 11 }] }),
      );
    const arcs = await client.alarm.byType({
      start: '2026-10-27 00:00',
      end: '2026-10-28 00:00',
      typeNumbers: [AlarmType.Arc],
    });
    expect(arcs.map((a) => a.id)).toEqual([2, 3]);
  });

  it('tolerates a bare array response', async () => {
    postFormMock.mockResolvedValueOnce(ok([{ id: 9 }]));
    const page = await client.alarm.list({ start: '2026-10-27 00:00', end: '2026-10-28 00:00' });
    expect(page.datas).toHaveLength(1);
  });
});

describe('StatsApi', () => {
  it('prefers the addr=0 device total', () => {
    expect(client.stats.totalElectricity([{ addr: 0, electricity: 973.44 }, { addr: 1, electricity: 10 }])).toBe(
      973.44,
    );
    expect(client.stats.totalElectricity([{ addr: 1, electricity: 10 }, { addr: 2, electricity: 5 }])).toBe(15);
  });
});

describe('invoke escape hatch', () => {
  it('signs and unwraps an unwrapped method', async () => {
    postFormMock.mockResolvedValueOnce(ok({ anything: true }));
    const data = await client.invoke<{ anything: boolean }>('SOME_NEW_METHOD', { foo: 'bar' });
    expect(data.anything).toBe(true);
    expect(lastParams().foo).toBe('bar');
  });

  it('propagates a typed error', async () => {
    postFormMock.mockResolvedValueOnce({ status: 200, data: { code: '1008', message: '设备不存在' }, raw: '' });
    const err = await client.invoke('GET_BOX', { mac: 'X' }).catch((e) => e);
    expect(err).toBeInstanceOf(ElectricOpenPlatformError);
    expect(err.code).toBe('1008');
  });
});

describe('logout', () => {
  it('clears the in-memory token', async () => {
    expect(client.currentToken).not.toBeNull();
    await client.logout();
    expect(client.currentToken).toBeNull();
    await expect(client.box.list()).rejects.toMatchObject({ code: TransportCodes.NOT_CONFIGURED });
  });
});
