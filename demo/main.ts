import {
  ElectricOpenPlatform,
  ElectricOpenPlatformError,
  type Box,
  type ChannelRealtime,
} from '@plugin';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const logEl = $<HTMLPreElement>('log');
const connEl = $<HTMLSpanElement>('conn');
const storageEl = $<HTMLSpanElement>('storage');

let boxes: Box[] = [];

function log(label: string, payload: unknown): void {
  const text = payload instanceof Error ? `${payload.message}` : JSON.stringify(payload, null, 2);
  logEl.textContent = `// ${new Date().toLocaleTimeString()} ${label}\n${text}`;
}

function logError(label: string, err: unknown): void {
  if (err instanceof ElectricOpenPlatformError) {
    logEl.textContent = `// ${label} — code=${err.code}\n${err.message}\n${JSON.stringify(err.toJSON(), null, 2)}`;
  } else {
    logEl.textContent = `// ${label} — 失败\n${(err as Error)?.message ?? String(err)}`;
  }
}

function setConn(state: 'ok' | 'err' | 'idle', text: string): void {
  connEl.className = `badge ${state === 'ok' ? 'ok' : state === 'err' ? 'err' : ''}`;
  connEl.textContent = text;
}

/** Runs an action with a busy guard and unified error reporting. */
function action(el: HTMLElement, label: string, fn: () => Promise<void>): void {
  el.addEventListener('click', async () => {
    (el as HTMLButtonElement).disabled = true;
    try {
      await fn();
    } catch (err) {
      logError(label, err);
      if (err instanceof ElectricOpenPlatformError && err.isTokenExpired) setConn('err', '登录已失效');
    } finally {
      (el as HTMLButtonElement).disabled = false;
    }
  });
}

function renderBoxes(list: Box[]): void {
  if (!list.length) {
    $('boxes').innerHTML = '<span class="status">没有设备</span>';
    return;
  }
  const rows = list
    .map((b) => {
      const state = b.online === 1 ? '在线' : b.online === 0 ? '离线' : '未连接';
      const cls = b.online === 1 ? 'on' : 'off';
      return `<tr>
        <td class="${cls}">●</td>
        <td>${b.aliasName || b.mac}</td>
        <td><code>${b.mac}</code></td>
        <td>${b.build || '-'} / ${b.room || '-'}</td>
        <td class="${cls}">${state}</td>
        <td>${b.onlineLastTime ?? '-'}</td>
        <td>${b.protocol || '-'}</td>
      </tr>`;
    })
    .join('');
  $('boxes').innerHTML = `<table>
      <thead><tr><th></th><th>名称</th><th>mac</th><th>位置</th><th>状态</th><th>最后在线</th><th>协议</th></tr></thead>
      <tbody>${rows}</tbody></table>`;

  const online = list.filter((b) => b.online === 1);
  if (online.length) $<HTMLInputElement>('ctrlMac').value = online[0].mac;
}

function renderChannels(list: (ChannelRealtime & { mac: string })[]): void {
  if (!list.length) {
    $('channels').innerHTML = '<span class="status">没有线路数据</span>';
    return;
  }
  const rows = list
    .map((c) => {
      const voltage = c.aV ?? c.gV ?? 0;
      const current = c.aA ?? c.gA ?? 0;
      const temp = c.aT ?? c.gT ?? 0;
      const power = c.aW ?? c.gW ?? 0;
      const leakage = c.aLd ?? c.gLd ?? 0;
      const alarmCls = c.alarm ? 'err' : '';
      return `<tr>
        <td>${c.mac.slice(-6)}</td>
        <td>${c.addr}</td>
        <td>${c.title || '-'}</td>
        <td class="${c.oc ? 'on' : 'err'}">${c.oc ? '合闸' : '分闸'}</td>
        <td>${voltage} V</td>
        <td>${current} A</td>
        <td>${power} W</td>
        <td>${temp} ℃</td>
        <td>${leakage} mA</td>
        <td class="${c.enableNetCtrl ? '' : 'off'}">${c.enableNetCtrl ? '可远程' : '禁止'}</td>
        <td>${c.lineType}</td>
        <td class="${alarmCls}">${c.alarm || ''}</td>
      </tr>`;
    })
    .join('');
  $('channels').innerHTML = `<table>
      <thead><tr><th>设备</th><th>addr</th><th>线路</th><th>状态</th><th>电压</th><th>电流</th><th>功率</th><th>温度</th><th>漏电</th><th>远程</th><th>类型</th><th>告警位</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
}

function readConfig() {
  return {
    appKey: $<HTMLInputElement>('appKey').value.trim(),
    appSecret: $<HTMLInputElement>('appSecret').value.trim(),
    redirectUri: $<HTMLInputElement>('redirectUri').value.trim(),
    projectCode: $<HTMLInputElement>('projectCode').value.trim(),
    storage: $<HTMLSelectElement>('storageMode').value as 'auto' | 'preferences' | 'localStorage' | 'memory',
    timeoutMs: 20_000,
    logger: (e: { type: string; method?: string; message: string }) => {
      console.debug(`[eop:${e.type}]`, e.method ?? '', e.message);
    },
  };
}

// --- actions --------------------------------------------------------------

action($('btnLogin'), '登录', async () => {
  await ElectricOpenPlatform.configure(readConfig());
  storageEl.textContent = `存储：${await ElectricOpenPlatform.storageBackend()}`;
  const username = $<HTMLInputElement>('username').value.trim();
  const password = $<HTMLInputElement>('password').value;
  const result = await ElectricOpenPlatform.login(username, password);
  setConn('ok', '已登录');
  log('登录成功', { ...result, describe: ElectricOpenPlatform.describe() });
});

action($('btnLogout'), '退出', async () => {
  await ElectricOpenPlatform.logout();
  setConn('idle', '未登录');
  log('已退出', null);
});

action($('btnProject'), '项目信息', async () => {
  const info = await ElectricOpenPlatform.project.getInfo();
  log('项目信息', info);
});

action($('btnBoxes'), '设备列表', async () => {
  boxes = await ElectricOpenPlatform.box.list();
  renderBoxes(boxes);
  log(`设备列表（${boxes.length} 台，在线 ${boxes.filter((b) => b.online === 1).length} 台）`, boxes);
});

action($('btnTree'), '设备层级', async () => {
  const tree = await ElectricOpenPlatform.box.positionTree();
  log('设备层级', tree);
});

action($('btnRealtime'), '实时数据', async () => {
  const online = boxes.filter((b) => b.online === 1).slice(0, 2).map((b) => b.mac);
  if (!online.length) throw new Error('请先点“设备列表”，且至少有一台在线设备');
  const data = await ElectricOpenPlatform.channel.realtimeChannels({ mac: online });
  renderChannels(data);
  log(`实时数据（${online.join(', ')} → ${data.length} 条线路）`, data[0] ?? null);
});

action($('btnAlarms'), '告警', async () => {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 3600 * 1000);
  const page = await ElectricOpenPlatform.alarm.list({ start, end, pageSize: 20 });
  const rows = page.datas
    .map(
      (a) => `<tr><td>${a.time}</td><td>${a.mac.slice(-6)}</td><td>${a.addr}</td><td>${a.node}</td>
        <td>${a.info}</td><td>${a.typeNumber}</td><td class="${a.status === 1 ? 'err' : 'on'}">${a.status === 1 ? '产生' : '消除'}</td></tr>`,
    )
    .join('');
  logEl.textContent = `// 近 24 小时共 ${page.total} 条（显示本页 ${page.datas.length} 条）`;
  $('channels').innerHTML = `<table>
      <thead><tr><th>时间</th><th>设备</th><th>addr</th><th>线路</th><th>内容</th><th>type</th><th>状态</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="status">无告警</td></tr>'}</tbody></table>`;
});

action($('btnTimers'), '定时配置', async () => {
  const mac = $<HTMLInputElement>('ctrlMac').value.trim();
  if (!mac) throw new Error('请先选择设备');
  const timers = await ElectricOpenPlatform.control.getTimers({ mac });
  log('定时配置', timers);
});

action($('btnProbe'), '接口开通探测', async () => {
  const mac = $<HTMLInputElement>('ctrlMac').value.trim() || boxes[0]?.mac;
  const now = new Date();
  const y = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const cases: [string, Record<string, unknown>][] = [
    ['GET_PROJECT_INFO', {}],
    ['GET_BOXES', {}],
    ['GET_BOX', { mac }],
    ['GET_BOX_CHANNELS_REALTIME', { mac }],
    ['GET_BOX_PROPERTIES', { mac, nodeType: 'COMM' }],
    ['GET_BOXS_DAY_STATS', { mac, year: y, month: mm, day: dd }],
  ];
  const lines: string[] = [];
  for (const [method, params] of cases) {
    try {
      await ElectricOpenPlatform.invoke(method, params);
      lines.push(`✓ ${method.padEnd(28)} OK`);
    } catch (err) {
      const e = err instanceof ElectricOpenPlatformError ? err : null;
      const mark = e?.code === 'E_NOT_PROVISIONED' ? '✗ 未开通' : `✗ ${e?.code ?? '?'}`;
      lines.push(`${mark} ${method.padEnd(28)} ${e?.message ?? ''}`);
    }
  }
  logEl.textContent = `// 接口开通探测\n${lines.join('\n')}`;
});

async function control(actionName: 'open' | 'close'): Promise<void> {
  const mac = $<HTMLInputElement>('ctrlMac').value.trim();
  const addr = Number($<HTMLInputElement>('ctrlAddr').value);
  if (!mac) throw new Error('请先选择设备');
  if (!Number.isInteger(addr) || addr < 1) throw new Error('addr 必须是 >=1 的整数');
  const verb = actionName === 'open' ? '合闸' : '分闸';
  if (!confirm(`${verb}确认：设备 ${mac} 线路 ${addr}？\n\n该操作会真实作用于现场设备。`)) return;
  const result = await ElectricOpenPlatform.control.switchCircuit({
    mac,
    action: actionName,
    addr,
    skipWhenAbnormalLock: true,
  });
  log(`${verb}指令已下发`, result);
}

action($('btnOpen'), '合闸', () => control('open'));
action($('btnClose'), '分闸', () => control('close'));

// Restore a previous session if the token is still warm.
(async () => {
  try {
    const stored = globalThis.localStorage?.getItem('demo:eop:config');
    if (!stored) return;
    const saved = JSON.parse(stored);
    $<HTMLInputElement>('appKey').value = saved.appKey ?? '';
    $<HTMLInputElement>('redirectUri').value = saved.redirectUri ?? '';
    $<HTMLInputElement>('projectCode').value = saved.projectCode ?? '';
    $<HTMLInputElement>('username').value = saved.username ?? '';
    storageEl.textContent = '已载入上次配置（appSecret 未保存）';
  } catch {
    /* ignore */
  }
})();

// Persist everything except the secret.
$('btnLogin').addEventListener('click', () => {
  const c = readConfig();
  try {
    globalThis.localStorage?.setItem(
      'demo:eop:config',
      JSON.stringify({
        appKey: c.appKey,
        redirectUri: c.redirectUri,
        projectCode: c.projectCode,
        username: $<HTMLInputElement>('username').value.trim(),
      }),
    );
  } catch {
    /* storage may be disabled */
  }
});
