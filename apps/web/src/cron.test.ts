import { describe, expect, it } from 'vitest';
import { describeCron } from './cron.js';

describe('describeCron', () => {
  it('reads the shapes the presets produce', () => {
    expect(describeCron('*/15 * * * *')).toBe('every 15 minutes');
    expect(describeCron('0 * * * *')).toBe('hourly, at 00 past');
    expect(describeCron('0 */3 * * *')).toBe('every 3 hours, at 00 past');
    expect(describeCron('0 7 * * *')).toBe('daily at 07:00');
    expect(describeCron('0 8 * * 1-5')).toBe('weekdays at 08:00');
  });

  it('names individual days', () => {
    expect(describeCron('30 6 * * 1')).toBe('Monday at 06:30');
    expect(describeCron('30 6 * * 1,3')).toBe('Monday, Wednesday at 06:30');
  });

  /** Silence beats a confident wrong sentence: anything unrecognised is shown as written. */
  it('falls back to the expression rather than guessing', () => {
    expect(describeCron('0 0 1 1 *')).toBe('0 0 1 1 *');
    expect(describeCron('nonsense')).toBe('nonsense');
    expect(describeCron('0 0 * *')).toBe('0 0 * *');
  });
});
