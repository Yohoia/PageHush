import { describe, expect, it } from 'vitest';
import { articleIdFromShortId, articleShortId } from './article-address.js';

describe('fixed article addresses', () => {
  it('preserves every UUID bit, including leading zeroes and the maximum value', () => {
    const ids = [
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-4000-8000-000000000001',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
      ...Array.from({ length: 1000 }, () => crypto.randomUUID()),
    ];
    const keys = new Set<string>();
    for (const id of ids) {
      const key = articleShortId(id)!;
      expect(key).toMatch(/^[0-9A-Za-z]{22}$/);
      expect(articleIdFromShortId(key)).toBe(id);
      expect(articleShortId(id.toUpperCase())).toBe(key);
      keys.add(key);
    }
    expect(keys.size).toBe(ids.length);
  });

  it('rejects malformed addresses and values outside the UUID range', () => {
    for (const key of [
      '',
      '中文文章',
      '../article',
      '0'.repeat(21),
      '0'.repeat(23),
      '_'.repeat(22),
      'z'.repeat(22),
    ]) {
      expect(articleIdFromShortId(key)).toBeNull();
    }
    for (const id of ['', 'article', '中文标题', '00000000-0000-0000-0000-00000000000g']) {
      expect(articleShortId(id)).toBeNull();
    }
  });
});
