/**
 * HTTP transport.
 *
 * Why not `fetch` directly in an app: calling `https://open.snd02.com` from a
 * WebView origin (`capacitor://localhost`, `http://localhost`) is a cross-origin
 * request. The platform does not send CORS headers, so plain `fetch` fails on
 * device and in the browser. `CapacitorHttp` performs the request natively,
 * bypassing CORS entirely and behaving identically on iOS/Android/Web.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { ElectricOpenPlatformError, TransportCodes } from './errors.js';
const DEFAULT_TIMEOUT_MS = 20000;
function parseBody(raw) {
    const trimmed = raw.trim();
    if (trimmed === '')
        return null;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return raw;
    }
}
/**
 * Sends a form-urlencoded POST and returns the parsed body.
 *
 * Uses native HTTP on iOS/Android (no CORS, no cookie jar surprises) and falls
 * back to `fetch` on web. Both paths funnel through the same error mapping, so
 * callers never have to care which one ran.
 */
export async function postForm(req) {
    if (req.signal?.aborted) {
        throw new ElectricOpenPlatformError(TransportCodes.ABORTED, '请求已取消');
    }
    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        ...req.headers,
    };
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.post({
            url: req.url,
            headers,
            data: req.body,
            connectTimeout: timeoutMs,
            readTimeout: timeoutMs,
            responseType: 'text',
        });
        const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        if (res.status < 200 || res.status >= 300) {
            throw new ElectricOpenPlatformError(TransportCodes.HTTP, `服务器返回 HTTP ${res.status}`, { httpStatus: res.status, details: raw });
        }
        return { status: res.status, data: parseBody(raw), raw };
    }
    // Web / Node: AbortController gives us a browser-independent timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onAbort);
    try {
        const res = await fetch(req.url, {
            method: 'POST',
            headers,
            body: req.body,
            signal: controller.signal,
        });
        const raw = await res.text();
        if (!res.ok) {
            throw new ElectricOpenPlatformError(TransportCodes.HTTP, `服务器返回 HTTP ${res.status}`, {
                httpStatus: res.status,
                details: raw,
            });
        }
        return { status: res.status, data: parseBody(raw), raw };
    }
    catch (err) {
        if (err instanceof ElectricOpenPlatformError)
            throw err;
        const aborted = err?.name === 'AbortError';
        throw new ElectricOpenPlatformError(aborted ? TransportCodes.ABORTED : TransportCodes.NETWORK, aborted ? '请求超时或已取消' : `网络请求失败：${err?.message ?? err}`, { cause: err });
    }
    finally {
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
    }
}
//# sourceMappingURL=http.js.map