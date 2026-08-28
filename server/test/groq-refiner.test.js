import { describe, expect, it } from 'vitest';
import { buildPcm16Wav, GroqTranscriptRefiner } from '../src/transcription/groq-refiner.js';

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

  it('disables Qwen reasoning for transcript merge requests', async () => {
    let mergeRequest;
    const refiner = new GroqTranscriptRefiner();
    refiner.client = {
      audio: {
        transcriptions: {
          create: async () => ({ text: 'deploy the websocket service' }),
        },
      },
      chat: {
        completions: {
          create: async (request) => {
            mergeRequest = request;
            return { choices: [{ message: { content: 'Deploy the WebSocket service.' } }] };
          },
        },
      },
    };

    await refiner.refine({
      pcm: Buffer.alloc(16000),
      deepgramText: 'Deploy the web socket server.',
    });

    expect(mergeRequest.reasoning_effort).toBe('none');
  });
});
