import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { formatAlarmTime, formatTimestamp, md5 } from '../src/core/crypto';

const nodeMd5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex');

describe('md5', () => {
  it('matches the RFC 1321 test vectors', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(md5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b');
  });

  it('handles block boundaries (55, 56, 64, 65 bytes)', () => {
    for (const len of [55, 56, 57, 63, 64, 65, 1000]) {
      const input = 'x'.repeat(len);
      expect(md5(input)).toBe(nodeMd5(input));
    }
  });

  it('hashes UTF-8 bytes, not code units (Chinese + emoji)', () => {
    for (const input of ['佛山市毅丰电器实业有限公司', '智慧式用电', '温度28.6℃', '⚡🔌', 'a佛b⚡c']) {
      expect(md5(input)).toBe(nodeMd5(input));
    }
  });
});

describe('formatTimestamp', () => {
  it('formats local time as yyyyMMddHHmmss with zero padding', () => {
    const d = new Date(2016, 11, 31, 1, 25, 18);
    expect(formatTimestamp(d)).toBe('20161231012518');
    expect(formatTimestamp(new Date(2024, 0, 5, 9, 3, 7))).toBe('20240105090307');
  });
});

describe('formatAlarmTime', () => {
  it('formats yyyy-MM-dd HH:mm', () => {
    expect(formatAlarmTime(new Date(2026, 9, 28, 15, 5))).toBe('2026-10-28 15:05');
  });
});
