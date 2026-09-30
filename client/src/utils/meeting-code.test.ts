import { describe, expect, it } from 'vitest';
import { buildInviteText } from './calendar-invite';
import { parseMeetingCode } from './meeting-code';

describe('parseMeetingCode', () => {
  it('accepts a canonical code and ignores case and surrounding space', () => {
    expect(parseMeetingCode('abc-defg-hij')).toBe('abc-defg-hij');
    expect(parseMeetingCode('  ABC-DEFG-HIJ  ')).toBe('abc-defg-hij');
  });

  it('accepts the three blocks separated by spaces', () => {
    expect(parseMeetingCode('abc defg hij')).toBe('abc-defg-hij');
    expect(parseMeetingCode('abc   defg   hij')).toBe('abc-defg-hij');
  });

  it('pulls the code out of a lobby or room link, dropping the query and hash', () => {
    expect(parseMeetingCode('https://ameet.raja-dev.me/lobby/abc-defg-hij?guest=1')).toBe('abc-defg-hij');
    expect(parseMeetingCode('https://ameet.raja-dev.me/room/ABC-DEFG-HIJ#join')).toBe('abc-defg-hij');
    expect(parseMeetingCode('http://localhost:5173/lobby/abc-defg-hij/')).toBe('abc-defg-hij');
    expect(parseMeetingCode('ameet.raja-dev.me/lobby/abc-defg-hij')).toBe('abc-defg-hij');
    expect(parseMeetingCode('abc-defg-hij?guest=1')).toBe('abc-defg-hij');
  });

  it('accepts an invite link wrapped in angle brackets', () => {
    expect(parseMeetingCode('<https://ameet.raja-dev.me/lobby/abc-defg-hij>')).toBe('abc-defg-hij');
  });

  it('accepts a quoted invite link', () => {
    expect(parseMeetingCode('"https://ameet.raja-dev.me/lobby/abc-defg-hij"')).toBe('abc-defg-hij');
    expect(parseMeetingCode("'https://ameet.raja-dev.me/room/abc-defg-hij'")).toBe('abc-defg-hij');
  });

  it('accepts a parenthesized invite link', () => {
    expect(parseMeetingCode('(https://ameet.raja-dev.me/lobby/abc-defg-hij)')).toBe('abc-defg-hij');
  });

  it('accepts an invite link with a leading zero-width space', () => {
    expect(parseMeetingCode('\u200Bhttps://ameet.raja-dev.me/lobby/abc-defg-hij')).toBe('abc-defg-hij');
  });

  it('accepts a host-less lobby or room path', () => {
    expect(parseMeetingCode('lobby/abc-defg-hij')).toBe('abc-defg-hij');
    expect(parseMeetingCode('room/ABC-DEFG-HIJ')).toBe('abc-defg-hij');
    expect(parseMeetingCode('/lobby/abc-defg-hij')).toBe('abc-defg-hij');
  });

  it('extracts the room code from a Copy-invite paste', () => {
    const invite = buildInviteText({
      title: 'Team standup',
      when: 'Tue, Mar 24 · 3:00 PM',
      joinUrl: 'https://ameet.raja-dev.me/lobby/abc-defg-hij',
    });
    expect(parseMeetingCode(invite)).toBe('abc-defg-hij');
  });

  it('rejects text that is not a meeting code', () => {
    expect(parseMeetingCode('')).toBeNull();
    expect(parseMeetingCode('   ')).toBeNull();
    expect(parseMeetingCode('abcdefghij')).toBeNull();
    expect(parseMeetingCode('not a meeting')).toBeNull();
    expect(parseMeetingCode('https://example.com/lobby/nope')).toBeNull();
    expect(parseMeetingCode('javascript:alert(1)')).toBeNull();
  });
});
