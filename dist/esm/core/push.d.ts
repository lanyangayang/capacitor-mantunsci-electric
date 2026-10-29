import { RouterClient } from './router.js';
import { PushSubscription, PushType } from './models.js';
export type PushCmd = 'QUERY' | 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'FAILED_CHECK' | 'FAILED_RESET';
/**
 * 消息推送订阅管理 SUBSCRIBE_PUSH_SERVICE.
 *
 * Note this is *server → your backend* push, not a WebSocket to the app. On a
 * mobile app you normally keep using polling (or run the receiver on your own
 * backend and relay via your own channel); the helpers here exist so an app can
 * configure/inspect the subscription from a settings screen.
 */
export declare class PushApi {
    private readonly client;
    constructor(client: RouterClient);
    private call;
    /** QUERY — inspect the current subscription for a push type. */
    query(pushType: PushType): Promise<PushSubscription | null>;
    /**
     * SUBSCRIBE — also used to modify (same pushType replaces the previous one).
     * IMPORTANT: the platform immediately POSTs a `detect` probe to `url` and
     * fails the call ("url请求错误") unless your endpoint answers `{code:0, msg:<detect>}`.
     */
    subscribe(args: {
        pushType: PushType;
        url: string;
        salt: string;
        timeRanges: string;
        projectCode?: string;
        pushEnable: 0 | 1;
        /** Required for pushType=1; pass '0' for status/event pushes. */
        typeNumbers?: string | number[];
        pushMode?: '1';
        equipmentTypes?: string | number[];
    }): Promise<unknown>;
    unsubscribe(projectCode?: string): Promise<unknown>;
    /** FAILED_CHECK — is the endpoint still healthy? */
    failedCheck(pushType: PushType): Promise<PushSubscription>;
    /** FAILED_RESET — re-enable pushing after the platform auto-disabled it. */
    failedReset(pushType: PushType, pushEnable?: 0 | 1): Promise<unknown>;
}
/**
 * Verifies an inbound push against the documented `key` scheme, for use in the
 * backend endpoint you register via {@link PushApi.subscribe}.
 *
 * `key = md5(salt + dateTime)` where dateTime is the alarm date (`yyyy-MM-dd`);
 * in batch mode (`pushMode: "1"`) the platform uses today's date instead.
 */
export declare function verifyPushKey(args: {
    salt: string;
    key: string;
    dateTime?: string;
    batch?: boolean;
    now?: Date;
}): boolean;
