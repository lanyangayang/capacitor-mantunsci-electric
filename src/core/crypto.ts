/**
 * Small, dependency-free crypto/time helpers.
 *
 * The plugin must stay framework free (no node:crypto, no js-sha1) because the
 * exact same code runs inside a WebView, in the Vite demo page and in Node
 * based unit tests.
 */

const HEX = '0123456789abcdef';

/**
 * MD5 of the UTF-8 encoding of `input`, lowercase hex (32 chars).
 *
 * The platform specifies MD5 over the UTF-8 byte stream (see the Java reference
 * implementation in the docs: `md.update(param.getBytes("utf-8"))`), so the
 * conversion below must be done on UTF-8 bytes, not on code units.
 */
export function md5(input: string): string {
  const bytes = utf8Bytes(input);
  const words = toWords(bytes);
  const digest = md5Words(words, bytes.length);
  let out = '';
  for (let i = 0; i < 4; i++) {
    const word = digest[i];
    for (let j = 0; j < 4; j++) {
      out += HEX.charAt((word >>> (j * 8 + 4)) & 0x0f);
      out += HEX.charAt((word >>> (j * 8)) & 0x0f);
    }
  }
  return out;
}

function utf8Bytes(input: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let cp = input.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

function toWords(bytes: number[]): number[] {
  const bitLen = bytes.length * 8;
  const withPadding = bytes.slice();
  withPadding.push(0x80);
  while (withPadding.length % 64 !== 56) withPadding.push(0);
  // 64-bit little-endian length; JS numbers stop being exact above 2^53, which
  // is far beyond any string we would ever sign.
  withPadding.push(bitLen & 0xff, (bitLen >>> 8) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 24) & 0xff);
  withPadding.push(0, 0, 0, 0);

  const words: number[] = [];
  for (let i = 0; i < withPadding.length; i += 4) {
    words.push(
      withPadding[i] | (withPadding[i + 1] << 8) | (withPadding[i + 2] << 16) | (withPadding[i + 3] << 24),
    );
  }
  return words;
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
  14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21, 6, 10, 15, 21,
];

const K = (() => {
  const k: number[] = [];
  for (let i = 0; i < 64; i++) k.push(Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) | 0);
  return k;
})();

function md5Words(words: number[], byteLen: number): number[] {
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let chunk = 0; chunk < words.length; chunk += 16) {
    const M = words.slice(chunk, chunk + 16);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) | 0;
    }

    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }

  void byteLen;
  return [a0, b0, c0, d0];
}

/**
 * The platform's `timestamp` parameter: `yyyyMMddHHmmss` in **local time**
 * (the docs say "当前时间截"), padded to two digits.
 */
export function formatTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    String(date.getFullYear()) +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/** Local `yyyy-MM-dd HH:mm` — the format GET_BOX_ALARM expects for start/end. */
export function formatAlarmTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A stable, deterministic non-cryptographic id used for request correlation. */
export function randomId(length = 12): string {
  let out = '';
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  return out;
}
