/**
 * Live end-to-end verification against the real open platform.
 *
 * Runs the *built* bundle (dist/esm) through the same code paths an app would
 * use: headless login → project info → boxes → realtime channels → alarms →
 * stats → token refresh. Credentials come from the environment so nothing
 * sensitive lands in the repository:
 *
 *   $env:EOP_APP_KEY='O000093290'
 *   $env:EOP_APP_SECRET='...'
 *   $env:EOP_REDIRECT='http://yourserverurl/receive'
 *   $env:EOP_PROJECT='P00000104893'
 *   $env:EOP_USER='yfdq01'
 *   $env:EOP_PASS='...'
 *   node scripts/verify-live.mjs
 */
import { ElectricOpenPlatform, ElectricOpenPlatformError } from '../dist/esm/index.js';

const required = {
  appKey: process.env.EOP_APP_KEY,
  appSecret: process.env.EOP_APP_SECRET,
  redirectUri: process.env.EOP_REDIRECT,
  projectCode: process.env.EOP_PROJECT,
  username: process.env.EOP_USER,
  password: process.env.EOP_PASS,
};

const missing = Object.entries(required)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`缺少环境变量：${missing.map((m) => `EOP_${m.toUpperCase()}`).join(', ')}`);
  process.exit(2);
}

const results = [];
function record(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${step}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  await ElectricOpenPlatform.configure({
    appKey: required.appKey,
    appSecret: required.appSecret,
    redirectUri: required.redirectUri,
    projectCode: required.projectCode,
    storage: 'memory',
  });
  record('configure', true, `存储后端=${await ElectricOpenPlatform.storageBackend()}`);

  const login = await ElectricOpenPlatform.login(required.username, required.password);
  record('login (authverify2 → token)', login.success, `expiresIn=${login.expiresIn}s`);

  const project = await ElectricOpenPlatform.project.getInfo();
  record('GET_PROJECT_INFO', !!project.projectCode, `${project.projectName} (${project.status})`);

  const boxes = await ElectricOpenPlatform.box.list();
  const online = boxes.filter((b) => b.online === 1);
  record('GET_BOXES', boxes.length > 0, `共 ${boxes.length} 台，在线 ${online.length} 台`);

  const tree = await ElectricOpenPlatform.box.positionTree();
  record('GET_BOX_POSITION_TREE', Array.isArray(tree), `${tree.length} 个顶层层级`);

  if (online.length) {
    const macs = online.slice(0, 2).map((b) => b.mac);
    const realtime = await ElectricOpenPlatform.channel.realtime({ mac: macs });
    const chCount = realtime.reduce((n, b) => n + b.channelList.length, 0);
    record(
      'GET_BOX_CHANNELS_REALTIME',
      realtime.length === macs.length && chCount > 0,
      `${macs.join(',')} → ${chCount} 条线路`,
    );

    const first = realtime[0]?.channelList?.[0];
    if (first) {
      record(
        '  ↳ 首条线路读数',
        true,
        `${first.title} oc=${first.oc} ${first.aV ?? first.gV ?? '-'}V ${first.aA ?? first.gA ?? '-'}A ${first.aT ?? first.gT ?? '-'}℃`,
      );
    }

    const channels = await ElectricOpenPlatform.channel.list({ mac: macs[0] });
    record('GET_BOX_CHANNELS', Array.isArray(channels), `${channels[0]?.channels?.length ?? 0} 个有效节点`);

    const props = await ElectricOpenPlatform.box.properties({ mac: macs[0] });
    record('GET_BOX_PROPERTIES', !!props && typeof props === 'object', `protocol=${props?.protocol ?? '-'}`);

    const nowTs = new Date();
    const dayStart = new Date(nowTs.getFullYear(), nowTs.getMonth(), nowTs.getDate());
    const history = await ElectricOpenPlatform.box.onlineHistory({
      mac: macs[0],
      startTime: dayStart,
      endTime: nowTs,
    });
    record('GET_BOX_ONLINE_HISTORY', !!history, `${history?.total ?? 0} 条轨迹记录`);

    const timers = await ElectricOpenPlatform.control.getTimers({ mac: macs[0] });
    record('GET_CFG_TIMER', Array.isArray(timers), `${timers.length} 条定时`);
  } else {
    record('GET_BOX_CHANNELS_REALTIME', false, '无在线设备，跳过');
  }

  // Alarms: last 24h, storage-time window (platform caps at 48h).
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 3600 * 1000);
  const alarms = await ElectricOpenPlatform.alarm.list({ start, end, pageSize: 10 });
  record('GET_BOX_ALARM', true, `近 24 小时 ${alarms.total} 条告警，本页 ${alarms.datas.length} 条`);

  // Statistics are NOT provisioned for this appKey (verified 2026-10-28), so
  // probe them as an optional step instead of failing the run.
  if (online.length) {
    const now = new Date();
    try {
      const stats = await ElectricOpenPlatform.stats.day({
        mac: online[0].mac,
        year: String(now.getFullYear()),
        month: String(now.getMonth() + 1).padStart(2, '0'),
        day: String(now.getDate()).padStart(2, '0'),
      });
      const rows = stats[online[0].mac] ?? [];
      record(
        'GET_BOXS_DAY_STATS',
        Array.isArray(rows),
        `${online[0].mac} 当日 ${rows.length} 条，总电量 ${ElectricOpenPlatform.stats.totalElectricity(rows).toFixed(3)} kWh`,
      );
    } catch (err) {
      const e = err instanceof ElectricOpenPlatformError ? err : null;
      if (e?.code === 'E_NOT_PROVISIONED') {
        record('GET_BOXS_DAY_STATS', true, `未开通（已正确识别为 NOT_PROVISIONED），跳过`);
      } else {
        record('GET_BOXS_DAY_STATS', false, e?.message ?? String(err));
      }
    }
  }

  // Force a refresh to prove the refresh token path works end-to-end.
  const before = ElectricOpenPlatform.currentToken?.accessToken;
  const refreshed = await ElectricOpenPlatform.refreshToken();
  record('oauth/refresh.as', refreshed.accessToken !== before, `新 token ${refreshed.accessToken.slice(0, 6)}…`);

  // Signed call still works with the refreshed token.
  const again = await ElectricOpenPlatform.project.getInfo();
  record('刷新后再次调用', !!again.projectCode, again.projectName);

  // Error mapping: a deliberately bogus mac on a provisioned method.
  try {
    await ElectricOpenPlatform.channel.list({ mac: '000000000000' });
    record('错误码映射', false, '预期失败但成功了');
  } catch (err) {
    const e = err instanceof ElectricOpenPlatformError ? err : null;
    record('错误码映射', !!e && e.code !== '0', `code=${e?.code} ${e?.message}`);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\n验证失败：', err instanceof ElectricOpenPlatformError ? err.toJSON() : err);
  process.exit(1);
});
