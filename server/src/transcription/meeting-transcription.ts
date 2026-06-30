import type { Server, Socket } from 'socket.io';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { appendTranscriptSegment, getTranscriptSnapshot, reviseTranscriptSegment } from '../socket/transcript-manager.js';
import { DeepgramMeetingSession } from './deepgram-session.js';
import { GroqTranscriptRefiner } from './groq-refiner.js';

interface ActiveContributor {
  roomId: string;
  session: DeepgramMeetingSession;
  audioWindowStartedAt: number;
  audioWindowBytes: number;
}

const sessions = new Map<string, ActiveContributor>();
const refiner = new GroqTranscriptRefiner();

function contextForRoom(roomId: string) {
  return getTranscriptSnapshot(roomId).entries.slice(-4).map((entry) => entry.text).join(' ');
}

export function transcriptionConfigured() {
  return !!env.transcription.deepgramApiKey;
}

export async function startContributor({ io, socket, roomId }: { io: Server; socket: Socket; roomId: string }) {
  if (!transcriptionConfigured()) throw new Error('Transcription providers are not configured');
  if (sessions.has(socket.id)) return;

  const user = socket.user;
  const session = new DeepgramMeetingSession({
    socketId: socket.id,
    onStatus: (state) => socket.emit('transcript-contributor-state', state),
    onInterim: ({ utteranceId, text }) => {
      io.to(roomId).emit('transcript-interim', {
        utteranceId,
        speaker: { id: user.id, name: user.name, avatar: user.avatar || '' },
        text,
        ts: Date.now(),
      });
    },
    onFinal: ({ utteranceId, text, audio }) => {
      const appended = appendTranscriptSegment(roomId, user, {
        clientSegmentId: `provider:${utteranceId}`,
        text,
        provider: 'deepgram',
        provisional: refiner.enabled,
      });
      if (!appended.entry) return;
      const entry = appended.entry;
      io.to(roomId).emit('transcript-segment', entry);

      if (!refiner.enabled) return;
      const context = contextForRoom(roomId);
      void refiner.refine({ pcm: audio, deepgramText: text, context }).then((refined) => {
        const revised = reviseTranscriptSegment(roomId, entry.id, refined.text, {
          provider: refined.provider,
        });
        if (revised) io.to(roomId).emit('transcript-segment', revised);
      });
    },
  });
  sessions.set(socket.id, {
    roomId,
    session,
    audioWindowStartedAt: Date.now(),
    audioWindowBytes: 0,
  });
  try {
    await session.start();
  } catch (error) {
    sessions.delete(socket.id);
    throw error;
  }
  logger.info({ event: 'transcript.contributorStarted', roomId, userId: user.id }, 'meeting transcription contributor started');
}

export function sendContributorAudio(socketId: string, audio: any) {
  const active = sessions.get(socketId);
  if (!active) return false;
  const buffer = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
  if (buffer.length > 64 * 1024) return false;
  const now = Date.now();
  if (now - active.audioWindowStartedAt >= 1000) {
    active.audioWindowStartedAt = now;
    active.audioWindowBytes = 0;
  }
  active.audioWindowBytes += buffer.length;
  // Expected PCM is 32 KB/s. Leave headroom for scheduling bursts while
  // preventing a compromised client from creating unbounded provider spend.
  if (active.audioWindowBytes > 96 * 1024) return false;
  active.session.send(buffer);
  return true;
}

export async function stopContributor(socketId: string) {
  const active = sessions.get(socketId);
  if (!active) return;
  sessions.delete(socketId);
  await active.session.stop();
}

export async function stopRoomContributors(roomId: string) {
  const matching = [...sessions.entries()].filter(([, active]) => active.roomId === roomId);
  await Promise.all(matching.map(([socketId]) => stopContributor(socketId)));
}
