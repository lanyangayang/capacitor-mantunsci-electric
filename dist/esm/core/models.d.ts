/**
 * Typed models for the open platform's `data` payloads.
 *
 * Field names mirror the wire format exactly (including the odd ones such as
 * `aTUp` or `mxgl`) so that mapping mistakes are caught at compile time rather
 * than surfacing as `undefined` in the UI.
 */
/** 设备类型 */
export declare enum EquipmentType {
    MicroBreaker = 1,
    ElectricalFire = 2,
    LiquidLevel = 4,
    Pressure = 5,
    SmokeForSafe = 6,
    GasForSafe = 7,
    SmokeZac = 10,
    TempHumidity = 11,
    SmartMeter = 12,
    GasZac = 13,
    Lux = 14,
    SmartWaterMeter = 16,
    SmokeWanlin = 29,
    TempWanlin = 39,
    SmokeHaiman = 42,
    GasHaiman = 45
}
export type ProjectStatus = 'INTERIM' | 'AUDITED' | 'REJECTED' | string;
export interface ProjectInfo {
    projectCode: string;
    projectName: string;
    status: ProjectStatus;
    provinceName?: string;
    cityName?: string;
    countyName?: string;
    provinceId?: string;
    cityId?: string;
    countyId?: string;
    street?: string;
    imgUrl?: string;
    longitude?: number;
    latitude?: number;
    linkMan?: string;
    linkTel?: string;
}
/** -1 未连接；0 离线；1 在线 */
export type OnlineState = -1 | 0 | 1;
export interface Box {
    mac: string;
    projectCode: string;
    equipmentType: EquipmentType | number;
    aliasName: string;
    build: string;
    unit: string;
    room: string;
    linkman: string;
    phone: string;
    online: OnlineState;
    onlineLastTime?: string;
    protocol: 'HTTP' | 'UDP' | '' | string;
    latitude?: number;
    longitude?: number;
    provinceName?: string;
    cityName?: string;
    countyName?: string;
    street?: string;
    extMeta?: string;
}
export interface PositionNode {
    name: string;
    childs?: PositionNode[];
    /** Leave nodes may carry a mac. */
    mac?: string;
    boxes?: Box[];
}
/** lineType 220=单相 380=三相 120=E系列单相 180=E系列三相 IO=808 */
export type LineType = '220' | '380' | '120' | '180' | 'IO' | string;
/**
 * One circuit ("线路/节点") snapshot from GET_BOX_CHANNELS_REALTIME.
 *
 * Single-phase devices fill the `a…` fields; three-phase devices fill `g…` plus
 * per-phase `a…`/`b…`/`c…`; the 808 IO module fills `digitalIns`/`digitalOuts`.
 */
export interface ChannelRealtime {
    mac?: string;
    addr: number;
    title: string;
    /** 线路有效性（与通信模块的连通性） */
    validity: boolean;
    /** 开关状态 true 合闸 / false 分闸 */
    oc: boolean;
    ocTime: string;
    /** 是否可以远程分合闸 */
    enableNetCtrl: boolean;
    updateTime: string;
    online: boolean;
    /** 刻度电量 kWh */
    power: number;
    /** 过功门限 */
    mxgg?: string | number;
    /** 过流门限 */
    mxgl?: string | number;
    lineType: LineType;
    /** 告警位 — deprecated by the platform, use GET_BOX_ALARM instead. */
    alarm: number;
    specification?: string;
    /** -1 表示进线直连，非 -1 表示汇电目标节点号 */
    gatherAddr: number;
    control: boolean;
    visibility: boolean;
    mainLine?: string;
    localLock: boolean;
    remoteLock: boolean;
    clearModel?: string;
    aLd?: number;
    aA?: number;
    aT?: number;
    aTUp?: number;
    aV?: number;
    aW?: number;
    aPF?: number;
    gLd?: number;
    gA?: number;
    gT?: number;
    gV?: number;
    gW?: number;
    gPF?: number;
    bA?: number;
    bT?: number;
    bTUp?: number;
    bV?: number;
    bW?: number;
    bPF?: number;
    cA?: number;
    cT?: number;
    cTUp?: number;
    cV?: number;
    cW?: number;
    cPF?: number;
    nA?: number;
    nT?: number;
    nTUp?: number;
    digitalIns?: number[];
    digitalOuts?: number[];
    analogIns?: string[];
}
export interface BoxRealtime {
    mac: string;
    channelList: ChannelRealtime[];
}
export interface BoxChannel {
    addr: number;
    title: string;
    oc: boolean;
    ocTime: string;
    updateTime: string;
}
export interface BoxChannels {
    mac: string;
    channels: BoxChannel[];
}
export type AlarmStatus = 0 | 1;
export interface AlarmRecord {
    id: number;
    autoid: number;
    mac: string;
    addr: number;
    node: string;
    /** 告警时间 yyyy-MM-dd HH:mm */
    time: string;
    info: string;
    /** JSON string: { his, elecType, unit, threshold, value } */
    valueDescribe: string;
    status: AlarmStatus;
    processStatus: 0 | 1 | 2 | 4;
    typeNumber: number;
}
export interface PagedResult<T> {
    total: number;
    page: number;
    totalPage: number;
    datas: T[];
}
export declare const AlarmType: {
    readonly ShortCircuit: 1;
    readonly LeakageMonitor: 2;
    readonly Overload: 3;
    readonly Overcurrent: 4;
    readonly Overvoltage: 5;
    readonly Undervoltage: 6;
    readonly Temperature: 7;
    readonly Surge: 8;
    readonly LeakageProtectOk: 9;
    readonly LeakageSelfTestIncomplete: 10;
    readonly Arc: 11;
    readonly LeakageWarning: 12;
    readonly CurrentWarning: 13;
    readonly OvervoltageWarning: 14;
    readonly UndervoltageWarning: 15;
    readonly CommWarning: 16;
    readonly PhaseLoss: 17;
    readonly ThreePhaseUnbalance: 18;
    readonly ThreePhaseSequence: 19;
    readonly PowerLoss: 53;
    readonly BoxOpen: 54;
    readonly TemperatureWarning: 55;
    readonly Humidity: 56;
    readonly Input: 57;
    readonly PowerNormal: 58;
    readonly MalignantLoad: 62;
    readonly Config: 1001;
    readonly Offline: 1002;
    readonly SwitchOffNotice: 1003;
    readonly SwitchOnNotice: 1004;
    readonly AbnormalOpen: 1005;
    readonly LeakageProtection: 1016;
    readonly Smoke: 2002;
    readonly Gas: 2006;
    readonly Pressure: 2003;
    readonly LiquidLevel: 2004;
    readonly DeviceFault: 9000;
    readonly CommFault: 9001;
};
export type AlarmTypeNumber = (typeof AlarmType)[keyof typeof AlarmType];
export interface ParsedAlarmValue {
    his?: boolean;
    elecType?: 1 | 2 | 3 | 4 | 5;
    unit?: string;
    threshold?: number;
    value?: number;
}
/** Daily / hourly / monthly statistics row. See GET_BOXES_DAY_STATS. */
export interface BoxStat {
    mac?: string;
    /** addr = 0 表示该设备总量 */
    addr?: number;
    /** 天区间用电量 kWh */
    electricity?: number;
    totalElectricity?: number;
    /** 平均电流 A */
    currentValue?: number;
    /** 平均电压 V */
    voltage?: number;
    tempA?: number;
    tempB?: number;
    tempC?: number;
    tempN?: number;
    /** 漏电流峰值 mA */
    leakageValue?: number;
}
export type BoxStatsByMac = Record<string, BoxStat[]>;
export type BoxStatsByMacAndPeriod = Record<string, Record<string, BoxStat[]>>;
export interface OnlineHistoryRecord {
    online?: number;
    time?: string;
    [key: string]: unknown;
}
export interface BoxControlCommand {
    OCSWITCH: {
        value1: 'open' | 'close';
        value2: string;
        value3?: 'ABNORMAL_LOCK_CHECK';
    };
    SWITCHSET: {
        value1: number;
        value2: string;
        value4?: number;
        value5?: number;
    };
    SETAUTOLEAK: {
        value1: 'true' | 'false';
        value2: number;
        value3: number;
        value4: number;
    };
    SETLOGINPWD: {
        value1: string;
        value2: string;
        force?: 'true' | 'false';
    };
    SETWIRELESS: {
        value1: string;
        value2: string;
        value3: string;
        value5: string;
        force?: 'true' | 'false';
    };
    UPDATEDEVICES: Record<string, string | number>;
    DELDEVICES: {
        'device.autoid': number;
    };
    DELDEVICESES: {
        autoid: string;
    };
    UPDATETIMER: Record<string, string | number>;
    DELTIMER: {
        'timer.autoid': number;
    };
    DELTIMERES: {
        autoid: string;
    };
    SETWIRING: {
        value1: number;
        value2: number;
    };
    DELALARM: {
        'alarm.autoid': number;
    };
    DELALARMES: {
        autoid: string;
    };
    SETVISIBILITY: {
        value1: number;
        value2: 0 | 1;
    };
    SETCONTROL: {
        value1: number;
        value2: 0 | 1;
    };
    REMOTE_SWITCH_LOCK: {
        value1: number;
        value2: 'true' | 'false';
    };
    ABNORMAL_SWITCH_UNLOCK: {
        value1: number;
    };
    THIRD_DEVICE_OCSWITCH: {
        value1: 'open' | 'close';
        value2: string;
    };
}
export type BoxControlCmd = keyof BoxControlCommand;
export interface TimerConfig {
    autoid: number;
    channel: string;
    /** 如 "三四"，空表示单次定时 */
    weekday: string;
    /** 循环: 时:分:秒；单次: 年-月-日 时:分:秒 */
    time: string;
    /** true 合闸 / false 分闸 / closeAndLock / unlockAndOpen */
    status: 'true' | 'false' | 'closeAndLock' | 'unlockAndOpen' | string;
}
export interface LeakageCheckConfig {
    autoid?: number;
    enable?: boolean | string;
    time?: string;
    [key: string]: unknown;
}
export interface BoxProperty {
    [key: string]: unknown;
}
export interface Scene {
    sceneId: string;
    sceneName?: string;
    [key: string]: unknown;
}
export interface PushSubscription {
    url: string;
    projectCode: string[];
    typeNumbers: (number | string)[];
    equipmentTypes?: number[];
    salt: string;
    pushEnable: 0 | 1;
    timeRanges: string[];
    pushMode?: string;
    failure?: {
        peroidStartTime: string;
        peroidEndTime: string;
        lastFailReason: string;
        failTimes: number;
    };
}
/** Push type 1=告警 2=节点状态 3=事件通知 */
export declare enum PushType {
    Alarm = 1,
    ChannelStatus = 2,
    Event = 3
}
