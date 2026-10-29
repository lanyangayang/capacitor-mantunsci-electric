import { md5 as md5Hex } from './crypto.js';
import { RouterClient } from './router.js';
import { ParamValue } from './sign.js';
import { PushSubscription, PushType } from './models.js';

export type PushCmd =
  | 'QUERY'
  | 'SUBSCRIBE'
  | 'UNSUBSCRIBE'
  | 'FAILED_CHECK'
  | 'FAILED_RESET';

/**
 * 消息推送订阅管理 SUBSCRIBE_PUSH_SERVICE.
 *
 * Note this is *server → your backend* push, not a WebSocket to the app. On a
 * mobile app you normally keep using polling (or run the receiver on your own
 * backend and relay via your own channel); the helpers here exist so an app can
 * configure/inspect the subscription from a settings screen.
 */
export class PushApi {
  constructor(private readonly client: RouterClient) {}

  private call<T>(cmd: PushCmd, params: Record<string, ParamValue> = {}): Promise<T> {
    return this.client.call<T>('SUBSCRIBE_PUSH_SERVICE', { params: { cmd, ...params } });
  }

  /** QUERY — inspect the current subscription for a push type. */
  query(pushType: PushType): Promise<PushSubscription | null> {
    return this.call<PushSubscription | null>('QUERY', { pushType });
  }

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
  }): Promise<unknown> {
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

  unsubscribe(projectCode = '*'): Promise<unknown> {
    return this.call('UNSUBSCRIBE', { projectCode });
  }

  /** FAILED_CHECK — is the endpoint still healthy? */
  failedCheck(pushType: PushType): Promise<PushSubscription> {
    return this.call<PushSubscription>('FAILED_CHECK', { pushType });
  }

  /** FAILED_RESET — re-enable pushing after the platform auto-disabled it. */
  failedReset(pushType: PushType, pushEnable: 0 | 1 = 1): Promise<unknown> {
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
export function verifyPushKey(args: {
  salt: string;
  key: string;
  dateTime?: string;
  batch?: boolean;
  now?: Date;
}): boolean {
  const day = args.batch ? formatDay(args.now ?? new Date()) : (args.dateTime ?? '').slice(0, 10);
  if (!day) return false;
  return md5Hex(args.salt + day) === args.key.toLowerCase();
}

function formatDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
