import Groq from 'groq-sdk';
import { toFile } from 'groq-sdk/uploads';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const SAMPLE_RATE = 16000;
const MIN_AUDIO_BYTES = Math.round(SAMPLE_RATE * 2 * 0.45);
const MAX_CONTEXT_CHARS = 700;

export function buildPcm16Wav(pcm: Buffer) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function cleanTranscript(text: unknown) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\s*(?:thank you for watching|thanks for watching|please subscribe)[.!?\s]*$/i, '')
    .replace(/<\/?think[^>]*>/gi, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 1000);
}

function lexicalForm(text: string) {
  return text.toLocaleLowerCase('en-US').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function shouldMerge(groqText: string, deepgramText: string) {
  const a = lexicalForm(groqText);
  const b = lexicalForm(deepgramText);
  if (a === b) return false;
  const distance = levenshtein(a, b) / Math.max(a.length, b.length, 1);
  return distance > 0.12 || a.split(' ').length !== b.split(' ').length;
}

export class GroqTranscriptRefiner {
  enabled: boolean;
  client: Groq | null;

  constructor() {
    this.enabled = !!env.transcription.groqApiKey;
    this.client = this.enabled ? new Groq({ apiKey: env.transcription.groqApiKey }) : null;
  }

  async refine({ pcm, deepgramText, context = '' }: { pcm: Buffer; deepgramText: string; context?: string }): Promise<{ text: string; provider: string }> {
    if (!this.client || !Buffer.isBuffer(pcm) || pcm.length < MIN_AUDIO_BYTES) {
      return { text: deepgramText, provider: 'deepgram' };
    }

    const startedAt = Date.now();
    try {
      const prompt = [
        'English video meeting. Preserve names, product names, acronyms, and technical terms exactly.',
        context ? `Recent meeting context: ${context.slice(-MAX_CONTEXT_CHARS)}` : '',
      ].filter(Boolean).join(' ');
      const file = await toFile(buildPcm16Wav(pcm), 'meeting-turn.wav', { type: 'audio/wav' });
      const result = await this.client.audio.transcriptions.create({
        file,
        model: env.transcription.groqModel,
        language: 'en',
        prompt,
        temperature: 0,
        response_format: 'json',
      }, { signal: AbortSignal.timeout(15_000), maxRetries: 1 });
      const groqText = cleanTranscript(result.text);
      if (!groqText) return { text: deepgramText, provider: 'deepgram' };

      let text = groqText;
      let provider = 'deepgram+groq';
      if (shouldMerge(groqText, deepgramText) && env.transcription.mergeModel) {
        try {
          const completion = await this.client.chat.completions.create({
            model: env.transcription.mergeModel,
            temperature: 0,
            max_tokens: 320,
            messages: [
              {
                role: 'system',
                content: 'Merge two speech transcripts of the same utterance. Trust Groq for exact words and jargon; trust Deepgram for punctuation. Preserve only spoken content. Return only the corrected transcript.',
              },
              {
                role: 'user',
                content: `<groq>${groqText}</groq>\n<deepgram>${deepgramText}</deepgram>`,
              },
            ],
          }, { signal: AbortSignal.timeout(8_000), maxRetries: 0 });
          const merged = cleanTranscript(completion.choices?.[0]?.message?.content);
          const sourceMax = Math.max(groqText.length, deepgramText.length);
          if (merged && merged.length <= sourceMax * 1.6 + 30) {
            text = merged;
            provider = 'deepgram+groq+merge';
          }
        } catch (error) {
          logger.warn({ event: 'transcript.mergeFailed', err: error instanceof Error ? error.message : String(error) }, 'transcript merge fell back to Groq');
        }
      }

      logger.info({
        event: 'transcript.refined',
        provider,
        latencyMs: Date.now() - startedAt,
        deepgramLength: deepgramText.length,
        refinedLength: text.length,
      }, 'meeting transcript turn refined');
      return { text, provider };
    } catch (error) {
      logger.warn({ event: 'transcript.refineFailed', err: error instanceof Error ? error.message : String(error) }, 'Groq refinement failed; keeping Deepgram text');
      return { text: deepgramText, provider: 'deepgram' };
    }
  }
}
