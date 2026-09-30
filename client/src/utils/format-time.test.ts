import { describe, expect, it } from 'vitest';
import { dayLabel, formatMeetingTime, relativeTime, timeLabel } from './format-time';

const now = new Date(2026, 5, 2, 15, 0, 0);

describe('relativeTime', () => {
  it('says a meeting inside the next minute is starting now', () => {
    expect(relativeTime(new Date(2026, 5, 2, 15, 0, 30), now)).toBe('Starting now');
  });

  it('does not call a meeting that already started "Starting now"', () => {
    expect(relativeTime(new Date(2026, 5, 2, 14, 59, 30), now)).toBe('Just started');
  });

  it('keeps sub-hour meetings in minutes', () => {
    expect(relativeTime(new Date(2026, 5, 2, 15, 20, 0), now)).toBe('in 20 min');
    expect(relativeTime(new Date(2026, 5, 2, 14, 40, 0), now)).toBe('20 min ago');
  });

  it('counts whole hours so 90 minutes is not reported as 2 hours', () => {
    expect(relativeTime(new Date(2026, 5, 2, 16, 30, 0), now)).toBe('in 1 hour');
    expect(relativeTime(new Date(2026, 5, 2, 13, 30, 0), now)).toBe('1 hour ago');
    expect(relativeTime(new Date(2026, 5, 2, 17, 0, 0), now)).toBe('in 2 hours');
  });

  it('counts whole days so 36 hours is not reported as 2 days', () => {
    expect(relativeTime(new Date(2026, 5, 4, 3, 0, 0), now)).toBe('in 1 day');
    expect(relativeTime(new Date(2026, 5, 5, 15, 0, 0), now)).toBe('in 3 days');
    expect(relativeTime(new Date(2026, 4, 30, 15, 0, 0), now)).toBe('3 days ago');
  });

  it('returns an empty hint for an unreadable time', () => {
    expect(relativeTime('not-a-date', now)).toBe('');
  });
});

describe('meeting clock labels', () => {
  it('labels today, tomorrow, and another day', () => {
    expect(dayLabel(new Date(2026, 5, 2, 9, 0, 0), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 5, 3, 9, 0, 0), now)).toBe('Tomorrow');
    expect(dayLabel(new Date(2026, 5, 1, 9, 0, 0), now)).toBe('Yesterday');
  });

  it('combines the day label with the local time', () => {
    const at = new Date(2026, 5, 2, 15, 0, 0);
    const clock = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(timeLabel(at)).toBe(clock);
    expect(formatMeetingTime(at, now)).toBe(`Today, ${clock}`);
  });
});
