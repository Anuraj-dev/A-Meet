import { Box } from '@mui/material';

// Dev-only WebRTC stats overlay (top-left). Renders nothing in production.
// Reads the `rtcStats` polled by useMediasoup so we can confirm audio is
// flowing cleanly: bitrate rising, packet loss ~0, stable jitter, FEC active.
interface RtcConsumerStat {
  id: string;
  kind: string;
  source: string;
  kbps: number;
  packetsLost: number;
  jitter: number | null;
  fec: number | null;
}

interface RtcStats {
  transport: string;
  consumers?: RtcConsumerStat[];
}

interface RtcStatsOverlayProps {
  stats?: RtcStats | null;
}

export default function RtcStatsOverlay({ stats }: RtcStatsOverlayProps) {
  if (!import.meta.env.DEV || !stats) return null;

  const consumers = stats.consumers ?? [];
  const lines = [`recv transport: ${stats.transport}`];
  for (const r of consumers) {
    lines.push(
      `${r.source}/${r.kind}  ${String(r.kbps).padStart(4)}kbps  ` +
      `loss:${r.packetsLost}  jit:${r.jitter ?? '-'}ms` +
      (r.fec != null ? `  fec:${r.fec}` : ''),
    );
  }
  if (consumers.length === 0) lines.push('(no remote consumers yet)');

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 64,
        left: 12,
        zIndex: 1500,
        bgcolor: 'rgba(0,0,0,0.72)',
        color: '#86e1ff',
        fontFamily: 'monospace',
        fontSize: 11,
        lineHeight: 1.5,
        borderRadius: 1,
        px: 1,
        py: 0.75,
        pointerEvents: 'none',
        whiteSpace: 'pre',
        maxWidth: '92vw',
        overflow: 'hidden',
      }}
    >
      {lines.join('\n')}
    </Box>
  );
}
