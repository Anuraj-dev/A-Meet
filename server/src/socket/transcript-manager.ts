import type { AuthUser } from '../types.js';

const MAX_TRANSCRIPT_ENTRIES = 5000;
const DEFAULT_EXPIRY_MS = 6 * 60 * 60 * 1000;

interface TranscriptEntry {
  id: string;
  sequence: number;
  speaker: { id: string; name: string; avatar: string };
  text: string;
  ts: number;
  provider: string;
  provisional: boolean;
  revisedAt?: number;
}

interface TranscriptSession {
  active: boolean;
  startedAt: number | null;
  startedBy: { id: string; name: string } | null;
  stoppedAt: number | null;
  nextSequence: number;
  entries: TranscriptEntry[];
  seenSegmentIds: Set<string>;
}

/** What appendTranscriptSegment reports back: at most one of these is set. */
interface AppendResult {
  error?: string;
  duplicate?: boolean;
  entry?: TranscriptEntry;
}

// The transcript is authoritative on the server but intentionally ephemeral for
// v1. Every client receives entries from this store; no browser assembles its own
// competing version. Rooms expire after their last participant leaves.
const transcripts = new Map<string, TranscriptSession>();
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function createSession(): TranscriptSession {
  return {
    active: false,
    startedAt: null,
    startedBy: null,
    stoppedAt: null,
    nextSequence: 1,
    entries: [],
    seenSegmentIds: new Set(),
  };
}

function getOrCreate(roomId: string): TranscriptSession {
  if (!transcripts.has(roomId)) transcripts.set(roomId, createSession());
  return transcripts.get(roomId)!;
}

function publicState(session: TranscriptSession) {
  return {
    active: session.active,
    startedAt: session.startedAt,
    startedBy: session.startedBy,
    stoppedAt: session.stoppedAt,
  };
}

export function getTranscriptSnapshot(roomId: string) {
  const session = getOrCreate(roomId);
  return { ...publicState(session), entries: [...session.entries] };
}

export function startTranscript(roomId: string, user: AuthUser, now = Date.now()) {
  const session = getOrCreate(roomId);
  session.active = true;
  session.startedAt ??= now;
  session.startedBy ??= { id: user.id, name: user.name };
  session.stoppedAt = null;
  return publicState(session);
}

export function stopTranscript(roomId: string, now = Date.now()) {
  const session = getOrCreate(roomId);
  session.active = false;
  session.stoppedAt = now;
  return publicState(session);
}

export function appendTranscriptSegment(roomId: string, user: AuthUser, payload: any, now = Date.now()): AppendResult {
  const session = getOrCreate(roomId);
  if (!session.active) return { error: 'Transcript is not active' };

  const text = typeof payload?.text === 'string'
    ? payload.text.trim().replace(/\s+/g, ' ').slice(0, 1000)
    : '';
  const clientSegmentId = typeof payload?.clientSegmentId === 'string'
    ? payload.clientSegmentId.slice(0, 100)
    : '';
  if (!text || !clientSegmentId) return { error: 'Invalid transcript segment' };

  // Socket/provider retries must not create duplicate canonical lines. Do not
  // deduplicate by text: repeated short turns such as "yes" are valid speech.
  if (session.seenSegmentIds.has(clientSegmentId)) return { duplicate: true };

  const entry = {
    id: `${roomId}:${session.nextSequence}`,
    sequence: session.nextSequence,
    speaker: { id: user.id, name: user.name, avatar: user.avatar || '' },
    text,
    ts: now,
    provider: payload.provider || 'browser',
    provisional: !!payload.provisional,
  };
  session.nextSequence += 1;
  session.entries.push(entry);
  session.seenSegmentIds.add(clientSegmentId);

  if (session.entries.length > MAX_TRANSCRIPT_ENTRIES) session.entries.shift();
  // Keep retry IDs bounded to roughly the same lifetime as retained entries.
  if (session.seenSegmentIds.size > MAX_TRANSCRIPT_ENTRIES * 2) {
    session.seenSegmentIds = new Set([...session.seenSegmentIds].slice(-MAX_TRANSCRIPT_ENTRIES));
  }
  return { entry };
}

export function reviseTranscriptSegment(roomId: string, entryId: string, text: unknown, metadata: { provider?: string } = {}, now = Date.now()) {
  const session = getOrCreate(roomId);
  const normalized = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').slice(0, 1000) : '';
  const index = session.entries.findIndex((entry) => entry.id === entryId);
  if (!normalized || index === -1) return null;

  const revised = {
    ...session.entries[index],
    text: normalized,
    provider: metadata.provider || session.entries[index].provider,
    provisional: false,
    revisedAt: now,
  };
  session.entries[index] = revised;
  return revised;
}

export function cancelTranscriptExpiry(roomId: string) {
  clearTimeout(expiryTimers.get(roomId));
  expiryTimers.delete(roomId);
}

export function scheduleTranscriptExpiry(roomId: string, delay = DEFAULT_EXPIRY_MS) {
  cancelTranscriptExpiry(roomId);
  const timer = setTimeout(() => {
    transcripts.delete(roomId);
    expiryTimers.delete(roomId);
  }, delay);
  timer.unref?.();
  expiryTimers.set(roomId, timer);
}

// Test-only reset kept explicit rather than exposing internal Maps.
export function clearTranscript(roomId: string) {
  cancelTranscriptExpiry(roomId);
  transcripts.delete(roomId);
}
