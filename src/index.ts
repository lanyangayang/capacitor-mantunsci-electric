/**
 * @packageDocumentation
 * Capacitor plugin for the Mtsci 智慧式用电数据开放平台 (open.snd02.com).
 *
 * ```ts
 * import { ElectricOpenPlatform } from '@mantunsci/capacitor-electric-open-platform';
 *
 * await ElectricOpenPlatform.configure({
 *   appKey: 'O000093290',
 *   appSecret: '…',                    // keep out of source control
 *   redirectUri: 'http://yourserverurl/receive',
 *   projectCode: 'P00000104893',
 *   storage: 'preferences',
 * });
 *
 * await ElectricOpenPlatform.login('yfdq01', '…');
 * const boxes = await ElectricOpenPlatform.box.listOnline();
 * const [live] = await ElectricOpenPlatform.channel.realtime({ mac: boxes[0].mac });
 * await ElectricOpenPlatform.control.switchCircuit({ mac: boxes[0].mac, action: 'close', addr: 1 });
 * ```
 */
export { ElectricOpenPlatform, ElectricOpenPlatformClient } from './client.js';

// Core building blocks — exported so host apps can sign their own calls or
// reuse the primitives in a backend.
export { md5, formatTimestamp, formatAlarmTime } from './core/crypto.js';
export {
  signParams,
  buildSignedRequest,
  encodeForm,
  signAuthCodeSecret,
  signRefreshSecret,
  type ParamValue,
} from './core/sign.js';
export { postForm, type HttpRequest, type HttpResponse } from './core/http.js';
export {
  ElectricOpenPlatformError,
  PlatformCodes,
  TransportCodes,
  describeCode,
  isElectricOpenPlatformError,
  type PlatformCode,
  type TransportCode,
} from './core/errors.js';
export {
  DEFAULT_BASE_URL,
  type ElectricConfig,
  type ElectricLogger,
  type ElectricLogEvent,
  type StorageMode,
  type TokenSet,
  type LoginResult,
  type ApiEnvelope,
} from './core/types.js';
export { TokenStore, resolveBackend, resetStorageBackend } from './core/storage.js';
export { AuthManager } from './core/auth.js';
export { RouterClient, type CallOptions } from './core/router.js';
export { verifyPushKey, type PushCmd } from './core/push.js';

// Domain APIs (for typing custom wrappers) and every wire model / enum.
export { ProjectApi, BoxApi, ChannelApi, ControlApi, AlarmApi, StatsApi, SceneApi } from './core/api.js';
export { PushApi } from './core/push.js';
export * from './core/models.js';
