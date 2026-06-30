type MergeableTranscriptEntry = {
  id?: string;
  sequence: number;
};

type TranscriptSpeaker = {
  id?: string;
  name?: string;
  avatar?: string;
};

type FormattableTranscriptEntry = MergeableTranscriptEntry & {
  ts: number;
  speaker?: TranscriptSpeaker | null;
  text: string;
};

type FormatTranscriptOptions = {
  entries: FormattableTranscriptEntry[];
  roomId: string;
  meetingTitle?: string | null;
};

export function mergeTranscriptEntries<TEntry extends MergeableTranscriptEntry>(
  current: TEntry[],
  incoming: TEntry[],
): TEntry[] {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    if (entry?.id) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
}

function timeLabel(timestamp: number): string {
  return `${new Date(timestamp).toISOString().slice(11, 19)} UTC`;
}

export function formatTranscript({ entries, roomId, meetingTitle }: FormatTranscriptOptions): string {
  const heading = meetingTitle || `Meeting ${roomId}`;
  const lines = [
    'A Meet transcript',
    heading,
    `Room: ${roomId}`,
    'Language: English (United States)',
    '',
  ];
  for (const entry of entries) {
    lines.push(`[${timeLabel(entry.ts)}] ${entry.speaker?.name || 'Participant'}: ${entry.text}`);
  }
  return `${lines.join('\n')}\n`;
}

export function downloadTranscript(options: FormatTranscriptOptions): void {
  const text = formatTranscript(options);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `a-meet-${options.roomId}-transcript.txt`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
