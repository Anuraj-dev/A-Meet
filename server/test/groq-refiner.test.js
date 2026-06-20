import { describe, expect, it } from 'vitest';
import { buildPcm16Wav } from '../src/transcription/groq-refiner.js';

describe('Groq transcription WAV preparation', () => {
  it('wraps 16 kHz mono PCM in a valid WAV container', () => {
    const pcm = Buffer.alloc(3200, 7);
    const wav = buildPcm16Wav(pcm);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(16000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });
});
