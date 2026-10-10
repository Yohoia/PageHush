import { describe, expect, it } from 'vitest';
import { countReadingUnits, estimateReadingTimeMinutes } from './reading-time.js';

describe('reading time', () => {
  it('counts CJK characters and latin words as reading units', () => {
    expect(countReadingUnits('你好 world')).toBe(3);
  });

  it('ignores markdown syntax and fenced code blocks', () => {
    expect(countReadingUnits('## 标题\n\n```js\nconst value = 1;\n```\n\n正文')).toBe(4);
  });

  it('always estimates at least one minute', () => {
    expect(estimateReadingTimeMinutes('')).toBe(1);
    expect(estimateReadingTimeMinutes('一个')).toBe(1);
  });

  it('rounds partial minutes up', () => {
    expect(estimateReadingTimeMinutes('字'.repeat(401))).toBe(2);
  });
});
