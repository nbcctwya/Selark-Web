import { describe, expect, it } from 'vitest';
import { compact, decimalString, duration, money, number, percent, relative, tone } from './format';

describe('display formatting', () => {
  it('never renders unknown values as zero', () => {
    expect(number(null)).toBe('未知');
    expect(number(undefined)).toBe('未知');
    expect(number(0)).toBe('0');
    expect(compact(null)).toBe('未知');
    expect(percent(null)).toBe('未知');
    expect(duration(null)).toBe('未知');
  });

  it('keeps decimal money strings exact and separates currencies', () => {
    expect(decimalString('0.174508000')).toBe('0.174508');
    expect(decimalString('12.500000000')).toBe('12.50');
    expect(decimalString('1234567.000000001')).toBe('1,234,567.000000001');
    expect(decimalString('0005')).toBe('5.00');
    expect(money({ USD: '0.100000000', CNY: '2.5' })).toBe('CNY 2.50 · USD 0.10');
    expect(money({})).toBe('未知 / 未定价');
  });

  it('formats durations, percentages and relative times', () => {
    expect(duration(815)).toBe('815 ms');
    expect(duration(2391)).toBe('2.39 s');
    expect(percent(0.938)).toBe('93.8%');
    const now = Date.parse('2026-11-04T12:00:00Z');
    expect(relative('2026-11-04T11:00:00Z', now)).toBe('1 小时前');
    expect(relative(null, now)).toBe('尚无记录');
  });

  it('maps states to distinct tones', () => {
    expect(tone('success')).toBe('good');
    expect(tone('failed')).toBe('bad');
    expect(tone('blocked_unknown_usage')).toBe('warn');
    expect(tone('never')).toBe('unknown');
  });
});
