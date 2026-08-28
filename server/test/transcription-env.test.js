import { afterEach, describe, expect, it, vi } from 'vitest';

const originalMergeModel = process.env.GROQ_TRANSCRIPT_MERGE_MODEL;

afterEach(() => {
  if (originalMergeModel === undefined) delete process.env.GROQ_TRANSCRIPT_MERGE_MODEL;
  else process.env.GROQ_TRANSCRIPT_MERGE_MODEL = originalMergeModel;
  vi.resetModules();
});

describe('transcription model defaults', () => {
  it('uses Groq\'s supported Qwen replacement for transcript merging', async () => {
    process.env.GROQ_TRANSCRIPT_MERGE_MODEL = '';
    vi.resetModules();
    const { env } = await import('../src/config/env.js');

    expect(env.transcription.mergeModel).toBe('qwen/qwen3.6-27b');
  });
});
