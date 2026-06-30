import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const MAX_CONNECT_BUFFER_CHUNKS = 100;
const MAX_UTTERANCE_BYTES = 16000 * 2 * 45;
const PRE_ROLL_CHUNKS = 6;

/** Status pushed to the contributor's own socket as the provider connects. */
export interface ContributorStatus {
  status: 'connecting' | 'listening' | 'error';
  provider?: string;
  message?: string;
}

export interface DeepgramSessionOptions {
  socketId: string;
  onInterim: (arg: { utteranceId: string; text: string }) => void;
  onFinal: (arg: { utteranceId: string; text: string; audio: Buffer }) => void;
  onStatus: (state: ContributorStatus) => void;
}

export class DeepgramMeetingSession {
  socketId: string;
  sessionId: string;
  onInterim: DeepgramSessionOptions['onInterim'];
  onFinal: DeepgramSessionOptions['onFinal'];
  onStatus: DeepgramSessionOptions['onStatus'];
  // The Deepgram live connection is an SDK object with loosely-typed event
  // payloads; kept `any` rather than chasing the SDK's internal shapes.
  connection: any;
  connected: boolean;
  stopping: boolean;
  connectBuffer: Buffer[];
  preRoll: Buffer[];
  utteranceChunks: Buffer[];
  utteranceByteLength: number;
  finalParts: string[];
  speechActive: boolean;
  utteranceNumber: number;

  constructor({ socketId, onInterim, onFinal, onStatus }: DeepgramSessionOptions) {
    this.socketId = socketId;
    this.sessionId = randomUUID();
    this.onInterim = onInterim;
    this.onFinal = onFinal;
    this.onStatus = onStatus;
    this.connection = null;
    this.connected = false;
    this.stopping = false;
    this.connectBuffer = [];
    this.preRoll = [];
    this.utteranceChunks = [];
    this.utteranceByteLength = 0;
    this.finalParts = [];
    this.speechActive = false;
    this.utteranceNumber = 1;
  }

  get utteranceId() {
    return `${this.socketId}:${this.sessionId}:${this.utteranceNumber}`;
  }

  async start() {
    if (!env.transcription.deepgramApiKey) throw new Error('Deepgram is not configured');
    const client = createClient(env.transcription.deepgramApiKey);
    this.connection = client.listen.live({
      model: env.transcription.deepgramModel,
      language: 'en-US',
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
      interim_results: true,
      endpointing: 300,
      utterance_end_ms: 1000,
      vad_events: true,
      smart_format: true,
      punctuate: true,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      if (!this.connection || this.stopping) return;
      this.connected = true;
      this.onStatus({ status: 'listening', provider: env.transcription.groqApiKey ? 'Deepgram + Groq' : 'Deepgram' });
      for (const chunk of this.connectBuffer) this.sendToProvider(chunk);
      this.connectBuffer = [];
    });
    this.connection.on(LiveTranscriptionEvents.SpeechStarted, () => this.beginSpeech());
    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => this.handleTranscript(data));
    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      logger.warn({ event: 'transcript.deepgramError', socketId: this.socketId, err: error?.message }, 'Deepgram meeting stream failed');
      this.onStatus({ status: 'error', message: 'Live transcription provider disconnected.' });
    });
    this.connection.on(LiveTranscriptionEvents.Close, () => {
      this.connected = false;
      if (!this.stopping) this.onStatus({ status: 'error', message: 'Live transcription provider closed unexpectedly.' });
    });
    this.onStatus({ status: 'connecting', provider: 'Deepgram' });
  }

  beginSpeech() {
    if (this.speechActive) return;
    this.speechActive = true;
    this.utteranceChunks = [...this.preRoll];
    this.utteranceByteLength = this.utteranceChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    this.finalParts = [];
  }

  handleTranscript(data: any) {
    const text = data.channel?.alternatives?.[0]?.transcript?.trim() || '';
    if (text && !this.speechActive) this.beginSpeech();

    if (text && data.is_final) {
      if (this.finalParts[this.finalParts.length - 1] !== text) this.finalParts.push(text);
    }

    const liveText = [...this.finalParts, data.is_final ? '' : text].filter(Boolean).join(' ').trim();
    if (liveText) this.onInterim({ utteranceId: this.utteranceId, text: liveText });

    if (data.speech_final && this.finalParts.length) {
      const finalText = this.finalParts.join(' ').replace(/\s+/g, ' ').trim();
      const audio = Buffer.concat(this.utteranceChunks);
      const utteranceId = this.utteranceId;
      this.onInterim({ utteranceId, text: '' });
      this.onFinal({ utteranceId, text: finalText, audio });
      this.utteranceNumber += 1;
      this.speechActive = false;
      this.utteranceChunks = [];
      this.utteranceByteLength = 0;
      this.finalParts = [];
      this.preRoll = [];
    }
  }

  sendToProvider(chunk: Buffer) {
    const arrayBuffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
    this.connection?.send(arrayBuffer);
  }

  send(chunk: Buffer) {
    if (this.stopping || !Buffer.isBuffer(chunk) || chunk.length === 0) return;
    this.preRoll.push(chunk);
    if (this.preRoll.length > PRE_ROLL_CHUNKS) this.preRoll.shift();
    if (this.speechActive) {
      this.utteranceChunks.push(chunk);
      this.utteranceByteLength += chunk.length;
      while (this.utteranceByteLength > MAX_UTTERANCE_BYTES && this.utteranceChunks.length > 1) {
        this.utteranceByteLength -= this.utteranceChunks.shift()!.length;
      }
    }

    if (this.connected) this.sendToProvider(chunk);
    else if (this.connectBuffer.length < MAX_CONNECT_BUFFER_CHUNKS) this.connectBuffer.push(chunk);
  }

  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    if (!this.connection) return;
    try {
      this.connection.finalize();
      await new Promise<void>((resolve) => setTimeout(resolve, 450));
      this.connection.requestClose();
    } catch { /* best-effort close */ }
    this.connection.removeAllListeners();
    this.connection = null;
    this.connected = false;
    this.connectBuffer = [];
    this.preRoll = [];
    this.utteranceChunks = [];
    this.utteranceByteLength = 0;
  }
}
