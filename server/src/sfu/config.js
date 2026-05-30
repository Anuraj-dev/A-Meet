// mediasoup static config (M4): the codecs a room's Router understands, the
// Worker tuning, and the WebRtcTransport options. Kept in one place so the
// Router (sfu-rooms.js) and the transports (sfu-handlers.js) agree.

import { env } from '../config/env.js';

// The codecs every Router advertises (its rtpCapabilities). We keep it lean:
//   - Opus for audio (the universal WebRTC audio codec).
//   - VP8 for video — broadest browser support, no licensing, simple SFU
//     forwarding. (H264/VP9/AV1 are future tuning; VP8 keeps M4 about the SFU,
//     not codec negotiation.)
// mediasoup auto-adds the matching RTX codec for retransmission.
export const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      // Nudge the encoder to start at a usable bitrate instead of crawling up.
      'x-google-start-bitrate': 1000,
    },
  },
];

// Per-Worker settings. The RTC port range is the band of UDP/TCP ports the
// Worker binds for media — it must be open in the firewall on LAN/prod.
export const workerSettings = {
  rtcMinPort: env.mediasoup.minPort,
  rtcMaxPort: env.mediasoup.maxPort,
  logLevel: 'warn',
  logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
};

// Options for every WebRtcTransport (one send + one recv per peer).
//   - listenInfos: bind on all interfaces (0.0.0.0) but ADVERTISE announcedIp
//     to clients (the address they actually dial). 127.0.0.1 → same machine only.
//   - prefer UDP (lower latency); fall back to TCP when UDP is blocked.
export const webRtcTransportOptions = {
  listenInfos: [
    { protocol: 'udp', ip: '0.0.0.0', announcedAddress: env.mediasoup.announcedIp },
    { protocol: 'tcp', ip: '0.0.0.0', announcedAddress: env.mediasoup.announcedIp },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1_000_000,
};
