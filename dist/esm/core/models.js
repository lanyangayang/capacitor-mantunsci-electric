/**
 * Typed models for the open platform's `data` payloads.
 *
 * Field names mirror the wire format exactly (including the odd ones such as
 * `aTUp` or `mxgl`) so that mapping mistakes are caught at compile time rather
 * than surfacing as `undefined` in the UI.
 */
/** 设备类型 */
export var EquipmentType;
(function (EquipmentType) {
    EquipmentType[EquipmentType["MicroBreaker"] = 1] = "MicroBreaker";
    EquipmentType[EquipmentType["ElectricalFire"] = 2] = "ElectricalFire";
    EquipmentType[EquipmentType["LiquidLevel"] = 4] = "LiquidLevel";
    EquipmentType[EquipmentType["Pressure"] = 5] = "Pressure";
    EquipmentType[EquipmentType["SmokeForSafe"] = 6] = "SmokeForSafe";
    EquipmentType[EquipmentType["GasForSafe"] = 7] = "GasForSafe";
    EquipmentType[EquipmentType["SmokeZac"] = 10] = "SmokeZac";
    EquipmentType[EquipmentType["TempHumidity"] = 11] = "TempHumidity";
    EquipmentType[EquipmentType["SmartMeter"] = 12] = "SmartMeter";
    EquipmentType[EquipmentType["GasZac"] = 13] = "GasZac";
    EquipmentType[EquipmentType["Lux"] = 14] = "Lux";
    EquipmentType[EquipmentType["SmartWaterMeter"] = 16] = "SmartWaterMeter";
    EquipmentType[EquipmentType["SmokeWanlin"] = 29] = "SmokeWanlin";
    EquipmentType[EquipmentType["TempWanlin"] = 39] = "TempWanlin";
    EquipmentType[EquipmentType["SmokeHaiman"] = 42] = "SmokeHaiman";
    EquipmentType[EquipmentType["GasHaiman"] = 45] = "GasHaiman";
})(EquipmentType || (EquipmentType = {}));
export const AlarmType = {
    ShortCircuit: 1,
    LeakageMonitor: 2,
    Overload: 3,
    Overcurrent: 4,
    Overvoltage: 5,
    Undervoltage: 6,
    Temperature: 7,
    Surge: 8,
    LeakageProtectOk: 9,
    LeakageSelfTestIncomplete: 10,
    Arc: 11,
    LeakageWarning: 12,
    CurrentWarning: 13,
    OvervoltageWarning: 14,
    UndervoltageWarning: 15,
    CommWarning: 16,
    PhaseLoss: 17,
    ThreePhaseUnbalance: 18,
    ThreePhaseSequence: 19,
    PowerLoss: 53,
    BoxOpen: 54,
    TemperatureWarning: 55,
    Humidity: 56,
    Input: 57,
    PowerNormal: 58,
    MalignantLoad: 62,
    Config: 1001,
    Offline: 1002,
    SwitchOffNotice: 1003,
    SwitchOnNotice: 1004,
    AbnormalOpen: 1005,
    LeakageProtection: 1016,
    Smoke: 2002,
    Gas: 2006,
    Pressure: 2003,
    LiquidLevel: 2004,
    DeviceFault: 9000,
    CommFault: 9001,
};
/** Push type 1=告警 2=节点状态 3=事件通知 */
export var PushType;
(function (PushType) {
    PushType[PushType["Alarm"] = 1] = "Alarm";
    PushType[PushType["ChannelStatus"] = 2] = "ChannelStatus";
    PushType[PushType["Event"] = 3] = "Event";
})(PushType || (PushType = {}));
//# sourceMappingURL=models.js.map