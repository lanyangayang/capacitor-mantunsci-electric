/**
 * Probes which platform methods this appKey is authorized for.
 *
 * "接口名称(X)无效！" means the method exists but is not enabled for the key;
 * a signature or auth error looks different, so this distinguishes
 * "not provisioned" from "broken".
 */
import { ElectricOpenPlatform, ElectricOpenPlatformError } from '../dist/esm/index.js';

const cfg = {
  appKey: process.env.EOP_APP_KEY,
  appSecret: process.env.EOP_APP_SECRET,
  redirectUri: process.env.EOP_REDIRECT,
  projectCode: process.env.EOP_PROJECT,
  username: process.env.EOP_USER,
  password: process.env.EOP_PASS,
};

const now = new Date();
const y = String(now.getFullYear());
const mm = String(now.getMonth() + 1).padStart(2, '0');
const dd = String(now.getDate()).padStart(2, '0');

const mac = process.env.EOP_MAC ?? '98CC4D13AE24';
const cases = [
  ['GET_PROJECT_INFO', {}],
  ['GET_BOXES', {}],
  ['GET_BOX', { mac }],
  ['GET_BOX_POSITION_TREE', {}],
  ['GET_BOX_CHANNELS', { mac }],
  ['GET_BOX_CHANNELS_REALTIME', { mac }],
  ['GET_BOX_CHANNELS_OC', { mac }],
  ['GET_BOX_ALARM', { start: '2026-10-27 00:00', end: '2026-10-28 00:00', mac }],
  ['GET_BOX_PROPERTIES', { mac, nodeType: 'COMM' }],
  ['GET_CFG_TIMER', { mac, autoid: 0 }],
  ['GET_CFG_LKICHK', { mac }],
  ['GET_BOX_ONLINE_HISTORY', { mac, startTime: `${y}-${mm}-${dd} 00:00`, endTime: `${y}-${mm}-${dd} 23:59` }],
  ['GET_BOXS_DAY_STATS', { mac, year: y, month: mm, day: dd }],
  ['GET_BOXS_HOUR_STATS', { mac, year: y, month: mm, day: dd }],
  ['GET_BOXS_MON_STATS', { mac, year: y }],
  ['GET_PROJECT_DAY_STATS', { year: y, month: mm, day: dd }],
  ['SCENE_SERVICE', { cmd: 'SCENE_QUERY' }],
  ['SUBSCRIBE_PUSH_SERVICE', { cmd: 'QUERY', pushType: 1 }],
];

async function main() {
  await ElectricOpenPlatform.configure({ ...cfg, storage: 'memory' });
  await ElectricOpenPlatform.login(cfg.username, cfg.password);

  const rows = [];
  for (const [method, params] of cases) {
    let status;
    let note = '';
    try {
      const data = await ElectricOpenPlatform.invoke(method, params);
      status = 'OK';
      note = Array.isArray(data) ? `${data.length} 条` : typeof data === 'object' && data ? 'object' : String(data).slice(0, 40);
    } catch (err) {
      const e = err instanceof ElectricOpenPlatformError ? err : null;
      if (e?.code === 'E_NOT_PROVISIONED') {
        status = 'NOT_PROVISIONED';
      } else if (e?.code === '1' && /无效/.test(e.message ?? '')) {
        status = 'NOT_PROVISIONED*';
      } else if (e?.code === '1') {
        status = 'ERR';
      } else {
        status = `code=${e?.code ?? 'unknown'}`;
      }
      note = e?.message ?? String(err);
    }
    rows.push({ method, status, note });
    console.log(`${status.padEnd(16)} ${method.padEnd(32)} ${note}`);
  }

  const ok = rows.filter((r) => r.status === 'OK').map((r) => r.method);
  const missing = rows.filter((r) => r.status === 'NOT_PROVISIONED').map((r) => r.method);
  console.log(`\n可用 (${ok.length}): ${ok.join(', ')}`);
  console.log(`未开通 (${missing.length}): ${missing.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
