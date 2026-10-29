/** Shared helpers so every module treats `projectCode` and limits identically. */
class ApiBase {
    constructor(client) {
        this.client = client;
    }
    call(method, params = {}, projectCode) {
        return this.client.call(method, { params, projectCode });
    }
    /** Normalises a comma list / array into the platform's comma-joined string. */
    static list(value) {
        if (value === undefined)
            return undefined;
        const arr = Array.isArray(value) ? value : value.split(',');
        const cleaned = arr.map((s) => s.trim()).filter(Boolean);
        if (cleaned.length === 0)
            return undefined;
        return cleaned.join(',');
    }
}
/** 项目信息：GET_PROJECT_INFO / MODIFY_PROJECT_INFO */
export class ProjectApi extends ApiBase {
    getInfo(projectCode) {
        return this.call('GET_PROJECT_INFO', {}, projectCode);
    }
    modifyInfo(fields) {
        const { projectCode, ...rest } = fields;
        return this.call('MODIFY_PROJECT_INFO', rest, projectCode);
    }
    /** 项目日统计 GET_PROJECT_DAY_STATS */
    dayStats(args) {
        return this.call('GET_PROJECT_DAY_STATS', { year: args.year, month: args.month, day: args.day }, args.projectCode);
    }
}
/** 设备：GET_BOXES / GET_BOX / GET_BOX_POSITION_TREE / MODIFY_BOX_INFO … */
export class BoxApi extends ApiBase {
    list(args = {}) {
        const { projectCode, ...rest } = args;
        return this.call('GET_BOXES', rest, projectCode);
    }
    /** Only online (-1 未连接 / 0 离线 / 1 在线). */
    async listOnline(args = {}) {
        const all = await this.list(args);
        return all.filter((b) => b.online === 1);
    }
    get(mac, projectCode) {
        return this.call('GET_BOX', { mac }, projectCode);
    }
    positionTree(projectCode) {
        return this.call('GET_BOX_POSITION_TREE', {}, projectCode);
    }
    /**
     * GET_BOX_PROPERTIES — 设备节点属性 (暂仅支持微断/A 系列设备).
     *
     * `nodeType` is **required** by the platform; the documented value for the
     * communication module is `COMM`. `addr` optionally targets one circuit.
     */
    properties(args) {
        return this.call('GET_BOX_PROPERTIES', { mac: args.mac, nodeType: args.nodeType ?? 'COMM', addr: args.addr }, args.projectCode);
    }
    modifyProperties(args) {
        const { mac, params = {}, projectCode } = args;
        return this.call('MODIFY_BOX_PROPERTIES', { mac, ...params }, projectCode);
    }
    modifyInfo(args) {
        const { projectCode, ...rest } = args;
        return this.call('MODIFY_BOX_INFO', rest, projectCode);
    }
    /**
     * 调节上报频率 SET_BOX_REALTIME_RATE.
     * `rate` is seconds between uploads — 5..180 for UDP modules, 5..600 for HTTP.
     */
    setRealtimeRate(args) {
        if (args.rate < 5) {
            throw new Error('rate 必须 >= 5 秒');
        }
        const mac = ApiBase.list(args.mac);
        if (!mac)
            throw new Error('mac 不能为空');
        return this.call('SET_BOX_REALTIME_RATE', { mac, enable: args.enable ? 'true' : 'false', rate: args.rate }, args.projectCode);
    }
    /**
     * 设备在线轨迹 GET_BOX_ONLINE_HISTORY.
     *
     * Note the platform wants `startTime` / `endTime` here — **not** the
     * `start`/`end` pair used by GET_BOX_ALARM. Format `yyyy-MM-dd HH:mm`;
     * only the last ~6 months are retained.
     */
    onlineHistory(args) {
        return this.call('GET_BOX_ONLINE_HISTORY', {
            mac: args.mac,
            startTime: toAlarmTime(args.startTime),
            endTime: toAlarmTime(args.endTime),
            page: args.page ?? 1,
            pageSize: args.pageSize ?? 100,
        }, args.projectCode);
    }
}
/** 线路/节点：实时状态、有效节点、分合闸控制 */
export class ChannelApi extends ApiBase {
    /**
     * GET_BOX_CHANNELS_REALTIME.
     *
     * Accepts 1..20 macs. The platform returns a **different shape** for one mac
     * (flat channel array) than for many (array of `{ mac, channelList }`); this
     * method always normalises to {@link BoxRealtime}[] so UI code never branches.
     */
    async realtime(args) {
        const macList = (Array.isArray(args.mac) ? args.mac : args.mac.split(',')).map((m) => m.trim()).filter(Boolean);
        if (macList.length === 0)
            throw new Error('mac 不能为空');
        if (macList.length > 20)
            throw new Error('GET_BOX_CHANNELS_REALTIME 一次最多 20 个设备');
        const raw = await this.call('GET_BOX_CHANNELS_REALTIME', { mac: macList.join(',') }, args.projectCode);
        return normaliseRealtime(raw, macList);
    }
    /** Flattened convenience: every circuit of every requested device. */
    async realtimeChannels(args) {
        const boxes = await this.realtime(args);
        const out = [];
        for (const box of boxes) {
            for (const ch of box.channelList)
                out.push({ ...ch, mac: box.mac });
        }
        return out;
    }
    /** GET_BOX_CHANNELS — the list of valid circuits (title/oc/updateTime only). */
    async list(args) {
        const params = {};
        if (args.param?.length) {
            params.param = JSON.stringify(args.param);
        }
        else if (args.mac) {
            params.mac = ApiBase.list(args.mac);
        }
        else {
            throw new Error('mac 与 param 必须传其一');
        }
        return this.call('GET_BOX_CHANNELS', params, args.projectCode);
    }
    /** GET_BOX_CHANNELS_OC — 开关状态（比 realtime 轻量）。 */
    channelsOc(args) {
        return this.call('GET_BOX_CHANNELS_OC', { mac: ApiBase.list(args.mac) }, args.projectCode);
    }
    /** 历史数据 GET_BOX_CHANNELS_REALTIME_HISTORY */
    history(args) {
        return this.call('GET_BOX_CHANNELS_REALTIME_HISTORY', { mac: args.mac, addr: args.addr, start: args.start, end: args.end }, args.projectCode);
    }
}
function normaliseRealtime(raw, requested) {
    if (!Array.isArray(raw))
        return [];
    const first = raw[0];
    const isWrapped = !!first && Array.isArray(first.channelList);
    if (isWrapped) {
        return raw.map((b) => ({
            mac: b.mac,
            channelList: (b.channelList ?? []).map((ch) => ({ ...ch, mac: ch.mac ?? b.mac })),
        }));
    }
    // Single-mac shape: the platform omits `mac`, so use what was requested.
    const mac = requested[0];
    return [
        {
            mac,
            channelList: raw.map((ch) => ({ ...ch, mac: ch.mac ?? mac })),
        },
    ];
}
/** 控制：PUT_BOX_CONTROL / BATCH_BOX_CONTROL */
export class ControlApi extends ApiBase {
    /**
     * Generic control dispatcher.
     *
     * `PUT_BOX_CONTROL` takes `cmd` plus a flat set of `value1..value5` (and, for
     * device/timer commands, dotted keys such as `device.autoid`).
     */
    control(args) {
        return this.call('PUT_BOX_CONTROL', {
            mac: args.mac,
            cmd: args.cmd,
            ...args.options,
        }, args.projectCode);
    }
    /** 合闸/分闸. Addresses are 1-based circuit addresses. */
    switchCircuit(args) {
        const addr = Array.isArray(args.addr) ? args.addr.join(',') : String(args.addr);
        return this.control({
            mac: args.mac,
            cmd: 'OCSWITCH',
            options: {
                value1: args.action,
                value2: addr,
                ...(args.skipWhenAbnormalLock ? { value3: 'ABNORMAL_LOCK_CHECK' } : {}),
            },
            projectCode: args.projectCode,
        });
    }
    /** 批量控制 BATCH_BOX_CONTROL */
    batchSwitch(args) {
        return this.call('BATCH_BOX_CONTROL', { cmd: 'OCSWITCH', value1: args.action, param: JSON.stringify(args.items) }, args.projectCode);
    }
    /** 改线路名称 / 功率限定 (SWITCHSET) */
    updateCircuit(args) {
        const options = { value1: args.addr, value2: args.title ?? '' };
        if (args.maxPowerW !== undefined)
            options.value4 = args.maxPowerW;
        if (args.overCurrentThreshold !== undefined)
            options.value5 = args.overCurrentThreshold;
        return this.control({ mac: args.mac, cmd: 'SWITCHSET', options, projectCode: args.projectCode });
    }
    /** 远程锁定/解锁一条线路 */
    remoteLock(args) {
        return this.control({
            mac: args.mac,
            cmd: 'REMOTE_SWITCH_LOCK',
            options: { value1: args.addr, value2: args.locked ? 'true' : 'false' },
            projectCode: args.projectCode,
        });
    }
    /** 对异常分闸锁定的线路执行远程解锁 */
    unlockAbnormal(args) {
        return this.control({
            mac: args.mac,
            cmd: 'ABNORMAL_SWITCH_UNLOCK',
            options: { value1: args.addr },
            projectCode: args.projectCode,
        });
    }
    /** 线路/设备显隐标记 */
    setVisibility(args) {
        return this.control({
            mac: args.mac,
            cmd: 'SETVISIBILITY',
            options: { value1: args.addr, value2: args.visible ? 1 : 0 },
            projectCode: args.projectCode,
        });
    }
    /** 是否允许控制标记 */
    setControl(args) {
        return this.control({
            mac: args.mac,
            cmd: 'SETCONTROL',
            options: { value1: args.addr, value2: args.controllable ? 1 : 0 },
            projectCode: args.projectCode,
        });
    }
    /** 自动漏电自检 */
    setAutoLeakage(args) {
        return this.control({
            mac: args.mac,
            cmd: 'SETAUTOLEAK',
            options: { value1: args.enable ? 'true' : 'false', value2: args.day, value3: args.hour, value4: args.minute },
            projectCode: args.projectCode,
        });
    }
    /** 设备定时配置 GET_CFG_TIMER (autoid = 0 返回全部) */
    getTimers(args) {
        return this.call('GET_CFG_TIMER', { mac: args.mac, autoid: args.autoid ?? 0 }, args.projectCode);
    }
    /** 漏电自检记录 GET_CFG_LKICHK */
    getLeakageCheck(args) {
        return this.call('GET_CFG_LKICHK', { mac: args.mac }, args.projectCode);
    }
}
/** 告警 */
export class AlarmApi extends ApiBase {
    /**
     * GET_BOX_ALARM.
     *
     * Platform limits: `start` within the last month, `end - start` <= 48 h, and
     * these windows are **storage time**, not alarm time.
     */
    async list(args) {
        const start = toAlarmTime(args.start);
        const end = toAlarmTime(args.end);
        assertWindows(start, end);
        const data = await this.call('GET_BOX_ALARM', {
            start,
            end,
            mac: args.mac,
            page: args.page ?? 1,
            pageSize: args.pageSize ?? 50,
            type: args.type ?? 'W',
            includeCalm: args.includeCalm ? 'true' : 'false',
        }, args.projectCode);
        if (Array.isArray(data)) {
            // Defensive: some deployments return a bare array.
            return { total: data.length, page: 1, totalPage: 1, datas: data };
        }
        const page = (data ?? {});
        return {
            total: page.total ?? 0,
            page: page.page ?? 1,
            totalPage: page.totalPage ?? 1,
            datas: page.datas ?? [],
        };
    }
    /** Walks every page of a window (capped by `maxPages`). */
    async listAll(args) {
        const maxPages = args.maxPages ?? 20;
        const first = await this.list({ ...args, page: 1 });
        const all = [...first.datas];
        const pages = Math.min(first.totalPage, maxPages);
        for (let p = 2; p <= pages; p++) {
            const next = await this.list({ ...args, page: p });
            all.push(...next.datas);
        }
        return all;
    }
    /** 按告警类型/设备过滤 (client side — the API has no such filter). */
    async byType(args) {
        const { typeNumbers, ...rest } = args;
        const rows = await this.listAll(rest);
        const set = new Set(typeNumbers);
        return rows.filter((r) => set.has(r.typeNumber));
    }
    /** 告警维护记录 GET_ALARM_MAINTENANCE */
    maintenance(args) {
        return this.call('GET_ALARM_MAINTENANCE', { alarmId: args.alarmId }, args.projectCode);
    }
    /** 催办/处理告警 ALARM_URGED */
    urged(args) {
        return this.call('ALARM_URGED', { alarmId: args.alarmId }, args.projectCode);
    }
    /** 设备维保历史 GET_BOX_MAINTENANCE_HISTORY */
    boxMaintenanceHistory(args) {
        return this.call('GET_BOX_MAINTENANCE_HISTORY', { mac: args.mac }, args.projectCode);
    }
}
function toAlarmTime(value) {
    if (typeof value === 'string')
        return value;
    const pad = (n) => String(n).padStart(2, '0');
    return (`${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
        ` ${pad(value.getHours())}:${pad(value.getMinutes())}`);
}
function assertWindows(start, end) {
    const s = new Date(start.replace(' ', 'T'));
    const e = new Date(end.replace(' ', 'T'));
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
        throw new Error('start/end 格式应为 yyyy-MM-dd HH:mm');
    }
    if (e <= s)
        throw new Error('end 必须大于 start');
    if (e.getTime() - s.getTime() > 48 * 3600 * 1000) {
        throw new Error('end 与 start 的间隔不能超过 48 小时');
    }
}
/** 统计 */
export class StatsApi extends ApiBase {
    period(method, args) {
        return this.call(method, { mac: ApiBase.list(args.mac), year: args.year, month: args.month, day: args.day }, args.projectCode);
    }
    /** 日统计 — 不传 day 返回当月每天 */
    day(args) {
        return this.period('GET_BOXS_DAY_STATS', args);
    }
    /** 小时统计 */
    hour(args) {
        return this.period('GET_BOXS_HOUR_STATS', args);
    }
    /** 月统计 */
    month(args) {
        return this.call('GET_BOXS_MON_STATS', { mac: ApiBase.list(args.mac), year: args.year }, args.projectCode);
    }
    /** Sum of `electricity` for a day across circuits (addr=0 row is the device total). */
    totalElectricity(stats) {
        const deviceTotal = stats.find((s) => s.addr === 0);
        if (deviceTotal && typeof deviceTotal.electricity === 'number')
            return deviceTotal.electricity;
        return stats.reduce((sum, s) => sum + (s.electricity ?? 0), 0);
    }
}
/** 场景/定时 (服务端触发) */
export class SceneApi extends ApiBase {
    list(projectCode) {
        return this.call('SCENE_SERVICE', { cmd: 'SCENE_QUERY' }, projectCode);
    }
    execute(args) {
        return this.call('SCENE_SERVICE', { cmd: 'SCENE_EXEC', sceneId: args.sceneId, ...(args.params ?? {}) }, args.projectCode);
    }
}
//# sourceMappingURL=api.js.map