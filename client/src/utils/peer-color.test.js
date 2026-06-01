import { describe, it, expect } from 'vitest';
import { getPeerColor, PEER_COLORS } from './peer-color.js';

describe('getPeerColor', () => {
  it('falls back to the first color for empty / missing names', () => {
    expect(getPeerColor('')).toBe(PEER_COLORS[0]);
    expect(getPeerColor(undefined)).toBe(PEER_COLORS[0]);
    expect(getPeerColor(null)).toBe(PEER_COLORS[0]);
  });

  it('always returns a color from the palette', () => {
    for (const name of ['Anuraj', 'Bob', 'Cara', 'a', 'zzzzzz', '🚀 rocket']) {
      expect(PEER_COLORS).toContain(getPeerColor(name));
    }
  });

  it('is deterministic — the same name maps to the same color', () => {
    expect(getPeerColor('Anuraj')).toBe(getPeerColor('Anuraj'));
    expect(getPeerColor('Saikia')).toBe(getPeerColor('Saikia'));
  });

  it('spreads different names across more than one color', () => {
    const names = ['Anuraj', 'Bob', 'Cara', 'Dave', 'Eve', 'Finn', 'Grace', 'Heidi'];
    const distinct = new Set(names.map(getPeerColor));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
