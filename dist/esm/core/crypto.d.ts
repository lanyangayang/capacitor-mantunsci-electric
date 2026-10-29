/**
 * Small, dependency-free crypto/time helpers.
 *
 * The plugin must stay framework free (no node:crypto, no js-sha1) because the
 * exact same code runs inside a WebView, in the Vite demo page and in Node
 * based unit tests.
 */
/**
 * MD5 of the UTF-8 encoding of `input`, lowercase hex (32 chars).
 *
 * The platform specifies MD5 over the UTF-8 byte stream (see the Java reference
 * implementation in the docs: `md.update(param.getBytes("utf-8"))`), so the
 * conversion below must be done on UTF-8 bytes, not on code units.
 */
export declare function md5(input: string): string;
/**
 * The platform's `timestamp` parameter: `yyyyMMddHHmmss` in **local time**
 * (the docs say "当前时间截"), padded to two digits.
 */
export declare function formatTimestamp(date?: Date): string;
/** Local `yyyy-MM-dd HH:mm` — the format GET_BOX_ALARM expects for start/end. */
export declare function formatAlarmTime(date: Date): string;
/** A stable, deterministic non-cryptographic id used for request correlation. */
export declare function randomId(length?: number): string;
