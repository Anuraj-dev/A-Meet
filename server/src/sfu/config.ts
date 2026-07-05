// mediasoup static config (M4): the codecs a room's Router understands, the
// Worker tuning, and the WebRtcTransport options. Kept in one place so the
// Router (sfu-rooms.js) and the transports (sfu-handlers.js) agree.

import http from 'http';
import type { types as MediasoupTypes } from 'mediasoup';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

// The codecs every Router advertises (its rtpCapabilities). We keep it lean:
//   - Opus for audio (the universal WebRTC audio codec).
//   - VP8 for video — broadest browser support, no licensing, simple SFU
//     forwarding. (H264/VP9/AV1 are future tuning; VP8 keeps M4 about the SFU,
//     not codec negotiation.)
// mediasoup auto-adds the matching RTX codec for retransmission.
export const mediaCodecs: MediasoupTypes.RouterRtpCodecCapability[] = [
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

// Per-peer resource caps (DoS guard). Without these an authenticated peer can
// spam `sfu-create-transport` / `sfu-produce` to exhaust the Worker's bounded RTC
// port range and file descriptors, degrading the SFU for everyone.
//   • Transports: a legitimate client opens exactly two — one send, one recv. The
//     extra headroom covers a transport recreated after an ICE/DTLS failure before
//     the stale one is garbage-collected.
export const MAX_TRANSPORTS_PER_PEER = 4;
//   • Producers: a legitimate client produces at most four tracks — mic, camera,
//     screen-share video, and screen-share audio. One slot of headroom covers a
//     produce that races an old producer's teardown.
export const MAX_PRODUCERS_PER_PEER = 5;

// Per-Worker settings. The RTC port range is the band of UDP/TCP ports the
// Worker binds for media — it must be open in the firewall on LAN/prod.
export const workerSettings: MediasoupTypes.WorkerSettings = {
  rtcMinPort: env.mediasoup.minPort,
  rtcMaxPort: env.mediasoup.maxPort,
  logLevel: 'warn',
  logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
};

// Options for every WebRtcTransport (one send + one recv per peer).
//   - listenInfos: bind on all interfaces (0.0.0.0) but ADVERTISE announcedIp
//     to clients (the address they actually dial). 127.0.0.1 → same machine only.
//   - prefer UDP (lower latency); fall back to TCP when UDP is blocked.
export const webRtcTransportOptions: MediasoupTypes.WebRtcTransportOptions = {
  listenInfos: [
    { protocol: 'udp', ip: '0.0.0.0', announcedAddress: env.mediasoup.announcedIp },
    { protocol: 'tcp', ip: '0.0.0.0', announcedAddress: env.mediasoup.announcedIp },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 1_000_000,
};

// ── Announced-IP resolution (the #1 cause of "can't see each other" on a cloud
//    host) ────────────────────────────────────────────────────────────────────
// mediasoup binds 0.0.0.0 but ADVERTISES `announcedAddress` to browsers — that's
// the address they actually send media to. On EC2 the NIC only carries the
// PRIVATE IP (e.g. 172.31.x.x); the public IP is NAT-mapped and never appears on
// the box. So if MEDIASOUP_ANNOUNCED_IP is unset / loopback / private, remote
// browsers get a private candidate they can't route to → ICE never completes →
// no producer is ever created → everyone is stuck on "You're the only one here".
//
// `resolveAnnouncedIp()` runs once at startup: if the env value is already a
// usable public address we keep it; otherwise we try the EC2 metadata service
// (IMDSv2) to auto-fill the public IPv4, and fail loudly if we still can't.

function isUnroutableForPeers(ip: string | undefined) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '0.0.0.0' || ip === 'localhost') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  // 172.16.0.0 – 172.31.255.255 (the EC2 default VPC range)
  const m = /^172\.(\d+)\./.exec(ip);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

// IMDSv2 requires a short-lived token (PUT) before reading metadata (GET).
// We keep both calls on a tight timeout so a non-EC2 host (where 169.254.169.254
// is unreachable) doesn't stall startup.
interface ImdsOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  timeout?: number;
}

function imdsRequest({ method, path, headers = {}, timeout = 1200 }: ImdsOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const req = http.request(
      { host: '169.254.169.254', method, path, headers, timeout },
      (res) => {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`IMDS ${res.statusCode}`)); }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { body += c; });
        res.on('end', () => resolve(body.trim()));
      },
    );
    req.on('timeout', () => req.destroy(new Error('IMDS timeout')));
    req.on('error', reject);
    req.end();
  });
}

async function fetchEc2PublicIp() {
  try {
    const token = await imdsRequest({
      method: 'PUT',
      path: '/latest/api/token',
      headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '60' },
    });
    const ip = await imdsRequest({
      method: 'GET',
      path: '/latest/meta-data/public-ipv4',
      headers: { 'X-aws-ec2-metadata-token': token },
    });
    return /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : null;
  } catch {
    return null;
  }
}

export async function resolveAnnouncedIp() {
  const configured = env.mediasoup.announcedIp;

  if (!isUnroutableForPeers(configured)) {
    logger.info({ announcedIp: configured, source: 'env' }, 'mediasoup announced IP resolved');
    return configured;
  }

  const publicIp = await fetchEc2PublicIp();
  if (publicIp) {
    for (const li of webRtcTransportOptions.listenInfos ?? []) li.announcedAddress = publicIp;
    logger.warn(
      { announcedIp: publicIp, configured, source: 'ec2-imds' },
      'MEDIASOUP_ANNOUNCED_IP was loopback/private — auto-detected EC2 public IPv4. Set it explicitly in .env to avoid this lookup.',
    );
    return publicIp;
  }

  const msg = 'MEDIASOUP_ANNOUNCED_IP is loopback/private and EC2 auto-detect failed. '
    + 'Remote browsers will NOT be able to connect media (everyone sees "You\'re the only one here"). '
    + 'Set MEDIASOUP_ANNOUNCED_IP to this host\'s PUBLIC IP and restart.';
  if (env.isProd) logger.error({ configured }, msg);
  else logger.warn({ configured }, `${msg} (ok for same-machine local dev)`);
  return configured;
}
