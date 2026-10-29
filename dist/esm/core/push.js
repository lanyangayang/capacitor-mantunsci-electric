import { md5 as md5Hex } from './crypto.js';
import { PushType } from './models.js';
/**
 * 消息推送订阅管理 SUBSCRIBE_PUSH_SERVICE.
 *
 * Note this is *server → your backend* push, not a WebSocket to the app. On a
 * mobile app you normally keep using polling (or run the receiver on your own
 * backend and relay via your own channel); the helpers here exist so an app can
 * configure/inspect the subscription from a settings screen.
 */
export class PushApi {
    constructor(client) {
        this.client = client;
    }
    call(cmd, params = {}) {
        return this.client.call('SUBSCRIBE_PUSH_SERVICE', { params: { cmd, ...params } });
    }
    /** QUERY — inspect the current subscription for a push type. */
    query(pushType) {
        return this.call('QUERY', { pushType });
    }
    /**
     * SUBSCRIBE — also used to modify (same pushType replaces the previous one).
     * IMPORTANT: the platform immediately POSTs a `detect` probe to `url` and
     * fails the call ("url请求错误") unless your endpoint answers `{code:0, msg:<detect>}`.
     */
    subscribe(args) {
        const typeNumbers = Array.isArray(args.typeNumbers)
            ? args.typeNumbers.join(',')
            : (args.typeNumbers ?? (args.pushType === PushType.Alarm ? '-1' : '0'));
        return this.call('SUBSCRIBE', {
            pushType: args.pushType,
            url: args.url,
            salt: args.salt,
            timeRanges: args.timeRanges,
            projectCode: args.projectCode ?? '*',
            pushEnable: args.pushEnable,
            typeNumbers,
            pushMode: args.pushMode,
            equipmentTypes: Array.isArray(args.equipmentTypes)
                ? args.equipmentTypes.join(',')
                : args.equipmentTypes,
        });
    }
    unsubscribe(projectCode = '*') {
        return this.call('UNSUBSCRIBE', { projectCode });
    }
    /** FAILED_CHECK — is the endpoint still healthy? */
    failedCheck(pushType) {
        return this.call('FAILED_CHECK', { pushType });
    }
    /** FAILED_RESET — re-enable pushing after the platform auto-disabled it. */
    failedReset(pushType, pushEnable = 1) {
        return this.call('FAILED_RESET', { pushType, pushEnable });
    }
}
/**
 * Verifies an inbound push against the documented `key` scheme, for use in the
 * backend endpoint you register via {@link PushApi.subscribe}.
 *
 * `key = md5(salt + dateTime)` where dateTime is the alarm date (`yyyy-MM-dd`);
 * in batch mode (`pushMode: "1"`) the platform uses today's date instead.
 */
export function verifyPushKey(args) {
    const day = args.batch ? formatDay(args.now ?? new Date()) : (args.dateTime ?? '').slice(0, 10);
    if (!day)
        return false;
    return md5Hex(args.salt + day) === args.key.toLowerCase();
}
function formatDay(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
//# sourceMappingURL=push.js.map